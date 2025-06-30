# school-moodle-langchain

## Testing

não esquecer que o MCP server tem de correr, basta
E:\MCPs\school-moodle-mcp>node ./build/src/index.js

Depois:
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"get_course_contents\", \"params\":
{\"moodle_token\": \"3179a582e0d26d63f534f3cce43e40cd\", \"course_id\": 6}}"

Para confirmar que o retorna a informação

## Executando o Agente LangChain (este serviço)

Este serviço pode ser executado em dois modos: Modo CLI (Interface de Linha de Comando) para testes e interações diretas, ou Modo API para expor um endpoint HTTP que pode ser consumido por outras aplicações (como uma webapp).

### Pré-requisitos

- Node.js instalado
- Dependências do projeto instaladas (execute `npm install` na raiz do projeto)
- Arquivo `.env` configurado com `GOOGLE_API_KEY`, `GOOGLE_MODEL`, e `MOODLE_MCP_SERVER`. Veja `.env.example`.

### Modo CLI (Linha de Comando)

Este modo é útil para testar o agente diretamente no seu terminal.

**Uso:**
```bash
node .\build\src\index.js --mode cli --token <SEU_MOODLE_TOKEN> [--course-id <ID_CURSO_OPCIONAL>]
```

**Argumentos:**
- `--mode cli`: Especifica a execução em modo CLI.
- `--token <SEU_MOODLE_TOKEN>`: (Obrigatório) O seu token de utilizador do Moodle.
- `--course-id <ID_CURSO_OPCIONAL>`: (Opcional) O ID de um curso específico do Moodle para fornecer contexto inicial ao agente.

Exemplo:
```bash
node .\build\src\index.js --mode cli --token 3179a582e0d26d63f534f3cce43e40cd --course-id 6
```
ou sem ID de curso:
```bash
node .\build\src\index.js --mode cli --token 3179a582e0d26d63f534f3cce43e40cd
```

Após iniciar, você verá um prompt `User:` onde poderá digitar suas perguntas para o agente.

### Modo API (Servidor SaaS)

Este modo inicia um servidor Express que expõe um endpoint `/invoke` para interagir com o agente programaticamente.

**Uso:**
```bash
node .\build\src\index.js --mode api
```

**Argumentos:**
- `--mode api`: Especifica a execução em modo API.

O servidor será iniciado, por padrão, na porta `3010` (ou na porta especificada pela variável de ambiente `PORT`).
O endpoint disponível é: `POST /invoke`

**Corpo da Requisição para `/invoke` (JSON):**
```json
{
  "input": "A sua pergunta para o agente",
  "moodle_user_token": "SEU_MOODLE_TOKEN_DE_UTILIZADOR",
  "moodle_course_id": "ID_CURSO_OPCIONAL", // Opcional
  "chat_history": [] // Opcional: array de mensagens anteriores (HumanMessage, AIMessage)
}
```

Exemplo de como chamar a API usando `curl`:
```bash
curl -X POST http://localhost:3010/invoke \
-H "Content-Type: application/json" \
-d '{
  "input": "Quais os cursos disponíveis?",
  "moodle_user_token": "3179a582e0d26d63f534f3cce43e40cd"
}'
```

Se o `moodle_course_id` for fornecido no modo API, ele será usado para contextualizar a pergunta para o agente, similar ao modo CLI.

## TODO

- [ ] Better Documentation (this is a start!)
- [ ] WebApp Communicating again by SAAS API
- [ ] Two paths, teacher vs Student
- [ ] LangChain analize and improve output
