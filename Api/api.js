
// ---------- BIBLIOTECAS UTILIZADAS PARA COMPOSIÇÃO DA API ---------------- //
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const mysql = require('mysql2/promise');
const http = require('http');
const fileUpload = require('express-fileupload');
const app = express();
const fs = require('fs');
const server = http.createServer(app);
const io = socketIO(server);

// ---------- PORTA ONDE O SERVIÇO SERÁ INICIADO ---------------- //
const port = 8007;

// ---------- ID DA EMPRESA QUE SERÁ ATIVADO ---------------- //
const idClient = '258';

process.setMaxListeners(20);

// ----------  SERVIÇO EXPRESS ---------------- //
app.use(express.json());
app.use(express.urlencoded({
extended: true
}));
app.use(fileUpload({
debug: true
}));

const SESSIONS_FILE = './whatsapp-sessions.json';

const criarArquivoSessaoSeNaoExistir = function() {

  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
    } catch(err) {
      console.log('Falha ao criar arquivo: ', err);
    }
  }
}

criarArquivoSessaoSeNaoExistir();

const salvarEstadoConexao = function(estado) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(estado));
  } catch(err) {
    console.log('Erro ao salvar estado de conexão: ', err);
  }
}

const obterEstadoConexao = function() {
  try {
    const conteudoArquivo = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const estado = JSON.parse(conteudoArquivo);
    return estado;
  } catch(err) {
    console.log('Erro ao obter estado de conexão: ', err);
    return null;
  }
}

// ----------  ROTA DEFAULT APENAS PARA CONFIRMAÇÃO QUE API ESTÁ ATIVA ---------------- //
// app.get('/', (req, res) => {
//   res.send('Conectado');
// });

app.use(express.json());
app.use(express.urlencoded({
extended: true
}));
app.use(fileUpload({
debug: true
}));
app.use("/", express.static(__dirname + "/"))
app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

// ----------  REALIZA A CONEXÃO COM O BANCO DE DADOS DO SISTEMA DELIVERY ---------------- //
//Teste
// const createConnection = async () => {
// 	return await mysql.createConnection({
// 		host: 'localhost',
// 		user: 'root',
// 		password: '',
// 		database: 'delivfood'   
// 	});
// }

//Produção
const createConnection = async () => {
	return await mysql.createConnection({
		host: '67.23.238.50',
		user: 'slee3957_sleeck',
		password: '3#jF~+g@4BY3',
		database: 'slee3957_sleeck'   
	});
}

// ---------- PARÂMETROS DO CLIENT DO WHATSAPP ---------------- //
const client = new Client({
  authStrategy: new LocalAuth({ clientId: idClient }),
  puppeteer: {
  // CAMINHO DO CHROME PARA WINDOWS (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  //===================================================================================
  // CAMINHO DO CHROME PARA MAC (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  //===================================================================================
  // CAMINHO DO CHROME PARA LINUX (REMOVER O COMENTÁRIO ABAIXO)
  //executablePath: '/usr/bin/google-chrome-stable',
  //===================================================================================
	args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ]
  },
   webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2407.3.html',
            },
    
});


// ----------  INITIALIZE DO CLIENT DO WHATSAPP ---------------- //
client.initialize();

// ---------- EVENTOS DE CONEXÃO EXPORTADOS PARA O INDEX.HTML VIA SOCKET ---------------- //
io.on('connection', function(socket) {

  if(obterEstadoConexao() == true){
    socket.emit('qr', '../../_core/_cdn/img/check.svg'); 
    socket.emit('message', 'conectado'); 
  }else{
    socket.emit('qr', '../../_core/_cdn/img/loading-load.gif');
    socket.emit('message', 'desconectado'); 
  }

  client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
    socket.emit('message', 'desconectado'); 
    socket.emit('qr', url);
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Dispositivo pronto!');
    socket.emit('qr', '../../_core/_cdn/img/check.svg');
    socket.emit('message', 'conectado'); 	
    salvarEstadoConexao(true);	
  });

  client.on('authenticated', () => {
      socket.emit('authenticated', 'Autenticado!');
      socket.emit('qr', '../../_core/_cdn/img/check.svg');
      socket.emit('message', 'conectado'); 
      salvarEstadoConexao(true);	
  });

  client.on('disconnected', (reason) => {
    socket.emit('qr', '../../_core/_cdn/img/loading-load.gif');  
    socket.emit('message', 'desconectado');   
    salvarEstadoConexao(false); 
    client.initialize();
  });
});

// ----------  INICIO FUNÇÕES CONSULTAS BANCO DE DADOS MYSQL ---------------- //
const consultaEstabAbertoFechado = async () => {
  const connection = await createConnection();

  try {
      const [rows] = await connection.execute(`SELECT funcionamento FROM estabelecimentos WHERE id = ? AND funcionamento = ?`, [idClient,'2']);

      if (rows.length > 0) {
          return true; //Estabelecimento fechado
      } else {
          return false; //Estabelecimento Aberto
      }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return "false";
  } finally {
      // Encerre a conexão após a execução da consulta
      connection.end();
  }
};

const consultaSubdominio = async () => {
  const connection = await createConnection();

  try {
      const [rows] = await connection.execute(`SELECT subdominio FROM estabelecimentos WHERE id = ? `, [idClient]);

      if (rows.length > 0) {
          return rows; //Estabelecimento fechado
      } else {
          return "1"; //Estabelecimento Aberto
      }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return "false";
  } finally {
      // Encerre a conexão após a execução da consulta
      connection.end();
  }
};

const consultaCliente = async (whatsapp,campo) => {
  const connection = await createConnection();

  try {
      const [rows] = await connection.execute(`SELECT ${campo} FROM clientes WHERE id_estabelecimento = ? AND whatsapp = ? `, [idClient, whatsapp]);
      if (rows.length > 0) {
          return rows;
      } else {
          return "1";
      }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return "false";
  } finally {
      // Encerre a conexão após a execução da consulta
      connection.end();
  }
};

const createCliente = async (nome,whatsapp,campo) => {

  const connection = await createConnection();
  const dataAtual = new Date();

  try {
    const sql = `INSERT INTO clientes (id_estabelecimento,nome,datadeinclusao,whatsapp,qtdpontos,qtdpedidos,ativo,${campo}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const values = [idClient, nome, dataAtual, whatsapp, 0, 0, 1, dataAtual];
    const [rows] = await connection.execute(sql, values);

    if (rows.length > 0) {
        return true;
    } else {
        return false;
    }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};

const updateMsgPeriodicidade = async (whatsapp, campo) => {
  const connection = await createConnection();
  const dataAtual = new Date();

  try {
    const [rows] = await connection.execute(`UPDATE clientes SET ${campo} = ? WHERE whatsapp = ?`, [dataAtual, whatsapp]);

    if (rows.length > 0) {
        return true;
    } else {
        return false;
    }
  } catch (error) {
      console.error('Erro na consulta SQL:', error.message);
      return false;
  } finally {
      connection.end();
  }
};

// ----------  ROTAS HTTP POSTA INTEGRAÇÃO EXTERNA ---------------- //
app.post('/status', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = req.body.number.replace(/\D/g,'');
  const numberDDD = number.substr(0, 2);
  const numberUser = number.substr(-8, 8);
  const message = req.body.message;

  if (numberDDD <= 30) {
    const numberZDG = "55" + numberDDD + "9" + numberUser + "@c.us";
    client.sendMessage(numberZDG, message).then(response => {
    res.status(200).json({
      status: true,
      message: 'Mensagem enviada',
    });
    }).catch(err => {
    res.status(500).json({
      status: false,
      message: 'Mensagem não enviada',
      response: err.text
    });
    });
  }
  else if (numberDDD > 30) {
    const notificaStatus = "55" + numberDDD + numberUser + "@c.us";
    client.sendMessage(notificaStatus, message).then(response => {
    res.status(200).json({
      status: true,
      message: 'Mensagem enviada',
    });
    }).catch(err => {
    res.status(500).json({
      status: false,
      message: 'Mensagem não enviada',
      response: err.text
    });
    });
  }
});

function obterPeriodoDoDia() {
  const agora = new Date();
  const hora = agora.getHours();

  if (hora >= 5 && hora < 12) {
    return 'Bom dia';
  } else if (hora >= 12 && hora < 18) {
    return 'Boa tarde';
  } else if (hora >= 18 && hora < 24) {
    return 'Boa noite';
  } else {
    return 'Boa madrugada';
  }
}

async function somaDiasPeriodicidade(data){

  // Obtém a data atual
  var dataAtual = new Date();

  // Converte a string para um objeto de data JavaScript
  var dataSaudacao = new Date(data);

  // Compara apenas o dia, mês e ano
  var mesmoDia = dataAtual.getDate() === dataSaudacao.getDate() &&
                 dataAtual.getMonth() === dataSaudacao.getMonth() &&
                 dataAtual.getFullYear() === dataSaudacao.getFullYear();

  if (mesmoDia) {
      return "true";
  } else {
      // Calcula a diferença em milissegundos
      var diferencaEmMilissegundos = Math.abs(dataAtual - dataSaudacao);

      // Converte a diferença para dias
      var diferencaEmDias = Math.ceil(diferencaEmMilissegundos / (1000 * 60 * 60 * 24));

      if (diferencaEmDias >= 1) {
          return "false";
      } else {
          return "true";
      }
  }
}

// ---------- EVENTO DE ESCUTA/ENVIO DE MENSAGENS RECEBIDAS PELA API ---------------- //
client.on('message', async msg => {

  const contact = await msg.getContact();
  const telefone = contact.number;

  var nome = "";

  if(contact.name !== undefined){
    nome = contact.name;
  }else if(contact.pushname !== undefined){
    nome = contact.pushname;
  }else{
    nome = telefone;
  }

  var resultadoEstabAbertoFechado = await consultaEstabAbertoFechado();
  var saudacaoDeContato = obterPeriodoDoDia();
  var url = await consultaSubdominio();
  var periodicidadeData = "";

  if (msg.body !== null && !msg.from.includes('@g.us') && msg.type.toLocaleLowerCase() !== "ciphertext" && msg.type.toLocaleLowerCase() !== "e2e_notification" && msg.type.toLocaleLowerCase() !== ""){

    if(resultadoEstabAbertoFechado == true){ // true = Estabelecimento fechado
      var clienteExistente = await consultaCliente(telefone.substring(2), "data_ausencia");
      if(clienteExistente === "1"){ // 1 = Não existe este cliente cadastrado ainda
        await createCliente(nome, telefone.substring(2), "data_ausencia");
        periodicidadeData = "false"; // false = Não enviou mensagem de ausencia ainda      
      }else if(clienteExistente[0].data_ausencia == null){
        periodicidadeData = "false";    
      }else{
        periodicidadeData = somaDiasPeriodicidade(clienteExistente[0].data_ausencia);
      }
    }else{
      var clienteExistente = await consultaCliente(telefone.substring(2), "data_saudacao");
      if(clienteExistente === "1"){ // 1 = Não existe este cliente cadastrado ainda
        await createCliente(nome, telefone.substring(2), "data_saudacao");
        periodicidadeData = "false"; // false = Não enviou mensagem de ausencia ainda            
      }else if(clienteExistente[0].data_saudacao == null){
        periodicidadeData = "false";    
      }else{
        periodicidadeData = somaDiasPeriodicidade(clienteExistente[0].data_saudacao);     
      }
    }

    if(periodicidadeData === "false"){

      if(resultadoEstabAbertoFechado === true){ // true = Estabelecimento fechado
        
        msg.reply(saudacaoDeContato + " " + nome + " 😊 Estamos fora do horário de expediente no momento. Mas não se preocupe, assim que voltarmos, estaremos prontos para lhe atender! 🚀");
        
        updateMsgPeriodicidade(telefone.substring(2), "data_ausencia");
      }else{
       
        msg.reply(`${saudacaoDeContato}, ${nome}! Beleza? 😊 Vamos facilitar pra você! Escolha:\n\n1️⃣ Para pedir pelo cardápio.\n\n2️⃣ Para falar com um dos nossos atendentes.\n\n\nSó digitar o número e estamos à disposição! 👍🚀`);
        
        updateMsgPeriodicidade(telefone.substring(2), "data_saudacao");
      }
    }
    
    if(msg.body === "1"){

      msg.reply(`🎉 Ótima escolha ${nome}!\n\nacesse através do link 👉 https://${url[0].subdominio}.sleeck.com.br`);
    
    }else if(msg.body === "2"){

      msg.reply(`E aí, ${nome}! Beleza? 😎\n\nBora agilizar seu pedido? Só manda aí o que quer e como prefere pagar. A gente tá aqui pra fazer seu dia ficar top! 🍔💳\n\nQualquer coisa, tamo junto pra ajudar! 😉🌟`);
    }
	}
});

// ---------- INITIALIZE DO SERVIÇO ---------------- //
server.listen(port, function() {
  console.log('Aplicativo rodando na porta *: ' + port);
});
