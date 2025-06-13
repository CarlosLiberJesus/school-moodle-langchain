# school-moodle-langchain

## Intro

Criação de um Agente que assista na educação, interagindo com se fosse um ChatGPT.

Não difere muito de uma extrutura de micro-serviços, que cada um tem a sua função.
WebApp -> Agent -> MCP Server -> Moodle API

A Moodle API já está em localhost e fornece os detalhes, só necessitamos de um orquestrador que decida que ferramentas, aka `access-points` vai aceder, para que autonomamente consiga responder às perguntas.

Este repositório representa o MicroServiço do Agente Orquestrador.

## Requesitos

### Frameworks para Desenvolvimento

npm: 10.9.2
node: v22.15.0

### Serviços Externos

- Google AI Studios API Tokem
- Moodle a correr localmente

### Outros repositórios

webapp: https://github.com/CarlosLiberJesus/school-final-webapp
mcp server: https://github.com/CarlosLiberJesus/school-moodle-mcp

## Modo Testes

### Modo Manual, chat consola sem web-app

npm run build
node build/src/index.js TOKEN_MOODLE COURSE_ID

#### Comandos no teste:

- "dashboard" -> ver métricas
- "reset" -> limpar métricas
- "stats" -> ver dados detalhados

### Modo automático, simula pedidos estáticos

npm run build
npm run test:server
