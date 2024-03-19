
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
const port = 8005;

// ---------- ID DA EMPRESA QUE SERÁ ATIVADO ---------------- //
const idClient = '154';

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
app.get('/', (req, res) => {
  res.send('Conectado');
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
		host: '191.252.143.38',
		user: 'delivfoo_delivfo',
		password: 'lh6{45gwNZ+H',
		database: 'delivfoo_delivery'   
	});
}

// ---------- PARÂMETROS DO CLIENT DO WHATSAPP ---------------- //
const client = new Client({
  authStrategy: new LocalAuth({ clientId: idClient }),
  puppeteer: { headless: true,
    // CAMINHO DO CHROME PARA WINDOWS (REMOVER O COMENTÁRIO ABAIXO)
    //executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    //===================================================================================
    // CAMINHO DO CHROME PARA MAC (REMOVER O COMENTÁRIO ABAIXO)
    //executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    //===================================================================================
    // CAMINHO DO CHROME PARA LINUX (REMOVER O COMENTÁRIO ABAIXO)
    executablePath: '/usr/bin/google-chrome-stable',
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
    ] }
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
      const [rows] = await connection.execute(`SELECT funcionamento FROM estabelecimentos WHERE estabelecimentos.funcionamento = ?`, ['2']);

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

 // ----------  INICIO FUNÇÕES INTERNAS ---------------- //
 
 const obterEstabaAbertoFechado = async () => {
  try {
    var estababertofechado = "";
    return estababertofechado = await consultaEstabAbertoFechado();    
  } catch (error) {
    console.error('Erro ao obter o horário se o estabelecimento está aberto ou fechado:', error);
  }
};

const verificarEstabelecimento = async () => {
  var resultado = await obterEstabaAbertoFechado();

  if (resultado[0].funcionamento === '2') {
    return resultado[0].funcionamento;
  }
};

function obterSaudacao() {
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

// ---------- EVENTO DE ESCUTA/ENVIO DE MENSAGENS RECEBIDAS PELA API ---------------- //
client.on('message', async msg => {

  const contact = await msg.getContact();
  const senderName = contact.name;

  var estabAbertoFechado = await verificarEstabelecimento();
  var saudacaoDeContato = await obterSaudacao();

  if (msg.body !== null && !msg.from.includes('@g.us') && msg.type.toLocaleLowerCase() !== "ciphertext" && msg.type.toLocaleLowerCase() !== "e2e_notification" && msg.type.toLocaleLowerCase() !== ""){
    if(estabAbertoFechado == 2){
      msg.reply(saudacaoDeContato + " " + senderName + " 😊 Estamos fora do horário de expediente no momento. Mas não se preocupe, assim que voltarmos, estaremos prontos para te ajudar! 🌟");
    }else if(estabAbertoFechado != 2 && msg.body === "1"){
      msg.reply("🎉 Ótima escolha " + senderName + "! Para fazer seu pedido pelo cardápio online, acesse nosso menu digital através do link 👉\n\nhttps://meudeliv.com.br/Theosacaaaidelivery\n\nEscolha seus produtos favoritos e siga as instruções para concluir seu pedido. Se precisar de ajuda, estamos à disposição.");
    }else if(estabAbertoFechado != 2 && msg.body === "2"){
      msg.reply("🎉 Ótima escolha, " + senderName + "! Estamos felizes em poder atendê-lo(a). 😊\n\nPara agilizar seu atendimento, por favor, nos informe o que deseja, seu pedido e a forma de pagamento que mais gosta. Estamos aqui para tornar seu dia mais saboroso e prático!\n\nSe tiver alguma dúvida, não hesite em perguntar. Estamos à disposição para ajudar! 🌟");
    }else if(estabAbertoFechado != 2 && msg.body === "3"){
      msg.reply("Prezado(a) " + senderName + ", agradecemos por entrar em contato conosco. Estamos prontos para lhe oferecer um atendimento personalizado.\n\nPor favor, informe-nos sobre suas necessidades e dúvidas. Estamos aqui para fornecer todas as informações necessárias e garantir a melhor experiência para você.\n\nSeu conforto e satisfação são nossa prioridade. Fique à vontade para fazer suas perguntas ou fornecer mais detalhes sobre o que precisa. Estamos à disposição!");
    }else if (estabAbertoFechado != 2){
      msg.reply(saudacaoDeContato + " " + senderName + " Como podemos te ajudar hoje? Escolha uma opção digitando o número correspondente:\n\n1️⃣ Para pedir pelo cardápio online.\n\n2️⃣ Para fazer seu pedido pelo WhatsApp.\n\n3️⃣ Para falar com um de nossos atendentes.\n\n\nDigite o número da opção desejada e estaremos prontos para te atender! 😊");
    }
	}
});

// ---------- INITIALIZE DO SERVIÇO ---------------- //
server.listen(port, function() {
  console.log('Aplicativo rodando na porta *: ' + port);
});
