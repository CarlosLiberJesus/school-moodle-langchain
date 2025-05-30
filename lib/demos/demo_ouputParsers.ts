import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  CommaSeparatedListOutputParser,
  StructuredOutputParser,
} from "langchain/output_parsers";

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.3,
  verbose: false,
  apiKey: "",
});

async function callStringOuputParser() {
  const prompt = ChatPromptTemplate.fromTemplate(
    `Separado por virgulas, quais os sinónimos de : {input}`
  );

  const outputParser = new CommaSeparatedListOutputParser();
  // Criar a chain
  const chain = prompt.pipe(model).pipe(outputParser);

  // Call chain
  return await chain.invoke({
    input: "liberdade",
  });
}

async function callStruturedOutputParse() {
  const prompt = ChatPromptTemplate.fromTemplate(
    `Extraí informação das tu sequite frase. 
    Instruções de formatação: {formatInstructions}
    Frase: {input}`
  );

  const outputParser = StructuredOutputParser.fromNamesAndDescriptions({
    name: "Nome da pessoa",
    age: "Idade da pessoa",
  });
  // Criar a chain
  const chain = prompt.pipe(model).pipe(outputParser);

  // Call chain
  return await chain.invoke({
    input: "O emanuel tem 30 anos?",
    formatInstructions: outputParser.getFormatInstructions(),
  });
}

/* Fase 0
//const response = await model.invoke("Hello World?");
//console.log(response);

const response2 = await model.stream("Hello World?");
for await (const chunk of response2) {
  console.log(chunk?.content);
}
*/
