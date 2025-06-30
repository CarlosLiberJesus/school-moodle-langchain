import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MoodleMcpClient } from "../lib/moodle-mcp-client.js";
import { GetMoodleCourseContentsTool } from "../src/tools/tool-course-contents.js";
import { FetchActivityContentTool } from "../src/tools/tool-get-activity-content.js";
import { GetActivityDetailsTool } from "../src/tools/tool-get-activity-details.js";
import { GetMoodleCoursesTool } from "../src/tools/tool-get-courses.js";
import { GetPageModuleContentTool } from "../src/tools/tool-get-page-module.js";
import { GetResourceFileContentTool } from "../src/tools/tool-get-resource-file.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MOODLE_TOKEN_FOR_TESTS = process.env.MOODLE_TOKEN_FOR_TESTS ?? "";
const MOODLE_MCP_SERVER = process.env.MOODLE_MCP_SERVER ?? "";

if (!MOODLE_TOKEN_FOR_TESTS) {
  console.error(
    "MOODLE_TOKEN_FOR_TESTS não encontrado no .env. Testes não podem prosseguir."
  );
  process.exit(1);
}

if (!MOODLE_MCP_SERVER) {
  console.error(
    "MOODLE_MCP_SERVER não encontrado no .env. Testes não podem prosseguir."
  );
  process.exit(1);
}

async function runAllClientToolTests() {
  // Corrigido: Passar MOODLE_TOKEN_FOR_TESTS para o construtor
  const mcpClient = new MoodleMcpClient(
    MOODLE_MCP_SERVER,
    MOODLE_TOKEN_FOR_TESTS
  );

  // Instanciar as tools
  const getCoursesTool = new GetMoodleCoursesTool(mcpClient);
  const getCourseContentsTool = new GetMoodleCourseContentsTool(mcpClient);
  const fetchActivityContentTool = new FetchActivityContentTool(mcpClient);
  const getActivityDetailsTool = new GetActivityDetailsTool(mcpClient);
  const getPageModuleContentTool = new GetPageModuleContentTool(mcpClient);
  const getResourceFileContentTool = new GetResourceFileContentTool(mcpClient);

  // Testes
  try {
    console.log("Test 1: get_courses (sem filtro)");
    // Corrigido: Removido config.configurable.moodle_user_token
    const courses = await getCoursesTool._call({ course_name_filter: null });
    console.log("Courses:", courses);

    console.log("\nTest 2: get_courses (com filtro)");
    const filteredCourses = await getCoursesTool._call({
      course_name_filter: "Aplicações Informáticas",
    });
    console.log("Filtered Courses:", filteredCourses);

    console.log("\nTest 3: get_course_contents");
    const courseContents = await getCourseContentsTool._call({ course_id: 6 });
    console.log("Course Contents:", courseContents);

    console.log("\nTest 4: get_activity_details by activity_id");
    const activityDetailsById = await getActivityDetailsTool._call({
      activity_id: 150,
    });
    console.log("Activity Details (by id):", activityDetailsById);

    console.log("\nTest 5: get_activity_details by activity_name only");
    const activityDetailsByNames = await getActivityDetailsTool._call({
      activity_name: "Componentes Fundamentais de um PC",
    });
    console.log("Activity Details (by names):", activityDetailsByNames);

    console.log("\nTest 6: fetch_activity_content by activity_id");
    const fetchedContentById = await fetchActivityContentTool._call({
      activity_id: 150,
    });
    console.log("Fetched Activity Content (by id):", fetchedContentById);

    console.log(
      "\nTest 7: fetch_activity_content by course_id + activity_name"
    );
    const fetchedContentByNames = await fetchActivityContentTool._call({
      activity_name: "Componentes Fundamentais de um PC",
    });
    console.log("Fetched Activity Content (by names):", fetchedContentByNames);

    console.log("\nTest 8: get_page_module_content");
    // Nota: GetPageModuleContentTool e GetResourceFileContentTool não foram refatoradas para remover token dos args
    // Se elas também precisarem de token, precisarão ser ajustadas como as outras.
    // Por agora, o teste permanece como estava, mas pode falhar se o token for necessário e não injetado corretamente.
    const pageContent = await getPageModuleContentTool._call(
      {
        page_content_url: "https://127.0.0.1/moodle/mod/assign/view.php?id=150",
      }
      // { configurable: { moodle_user_token: MOODLE_TOKEN_FOR_TESTS } } // Removido assumindo que a ferramenta será refatorada ou não precisa de token
    );
    console.log("Page Content:", pageContent);

    console.log("\nTest 9: get_resource_file_content");
    const resourceContent = await getResourceFileContentTool._call(
      {
        resource_file_url:
          "https://127.0.0.1/moodle/webservice/pluginfile.php/309/mod_resource/content/7/solucoes_11_12.pdf",
        mimetype: "application/pdf", // Este campo pode precisar ser moodle_token se a ferramenta o esperar
      }
      // { configurable: { moodle_user_token: MOODLE_TOKEN_FOR_TESTS } } // Removido
    );
    console.log("Resource File Content:", resourceContent);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runAllClientToolTests();
