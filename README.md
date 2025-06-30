# school-moodle-langchain

## Testing

não esquecer que o MCP server tem de correr, basta
E:\MCPs\school-moodle-mcp>node ./build/src/index.js

Depois:
curl -X POST http://localhost:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"get_course_contents\", \"params\":
{\"moodle_token\": \"3179a582e0d26d63f534f3cce43e40cd\", \"course_id\": 6}}"

Para confirmar que o retorna a informação

Já este serviço tem de
node .\build\src\index.js 3179a582e0d26d63f534f3cce43e40cd 6

## TODO

- [ ] Better Documentation
- [ ] WebApp Communicating again by SAAS API
- [ ] Two paths, teacher vs Student
- [ ] LangChain analize and improve output
