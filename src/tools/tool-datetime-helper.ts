import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
/**
 * @TODO Considerar Melhorias na Eficiência (Pós-MVP):
 * Se a abordagem de chamar GetActivityDetailsTool para cada atividade para obter duedate se mostrar muito lenta, revisitar a possibilidade de GetCourseActivitiesTool retornar o duedate diretamente.
 */

const dateTimeHelperToolSchema = z.object({
  action: z
    .enum([
      "getCurrentDateTimeISO",
      "convertTimestampToDateTimeISO",
      "getStartAndEndOfWeekISO",
      "getStartAndEndOfMonthISO",
    ])
    .describe("A ação a ser realizada pela ferramenta de data/hora."),
  value: z
    .string()
    .optional()
    .describe(
      "O valor para a ação (ex: timestamp em segundos como string para conversão, ou uma string de data ISO para calcular início/fim de semana/mês. Não é necessário para getCurrentDateTimeISO)."
    ),
});

type DateTimeHelperToolInput = z.infer<typeof dateTimeHelperToolSchema>;

export class DateTimeHelperTool extends StructuredTool<
  typeof dateTimeHelperToolSchema
> {
  name = "datetime_helper";
  description =
    "Fornece utilidades de data e hora. Ações disponíveis: " +
    "getCurrentDateTimeISO (retorna data/hora atual em ISO 8601), " +
    "convertTimestampToDateTimeISO (converte timestamp Unix em segundos para ISO 8601; 'value' deve ser o timestamp), " +
    "getStartAndEndOfWeekISO (retorna início de Segunda e fim de Domingo da semana para a data ISO fornecida em 'value', ou da semana atual se 'value' não for fornecido), " +
    "getStartAndEndOfMonthISO (retorna início e fim do mês para a data ISO fornecida em 'value', ou do mês atual se 'value' não for fornecido).";
  schema = dateTimeHelperToolSchema;

  constructor() {
    super();
    // Esta ferramenta não necessita do MoodleMcpClient
  }

  async _call(args: DateTimeHelperToolInput): Promise<string> {
    const { action, value } = args;
    const now = new Date();

    try {
      switch (action) {
        case "getCurrentDateTimeISO":
          return now.toISOString();

        case "convertTimestampToDateTimeISO":
          if (typeof value !== "number") {
            throw new Error(
              "Para convertTimestampToDateTimeISO, 'value' deve ser um timestamp numérico em segundos."
            );
          }
          return new Date(value * 1000).toISOString();

        case "getStartAndEndOfWeekISO": {
          const targetDate = value ? new Date(value as string) : now;
          if (isNaN(targetDate.getTime())) {
            throw new Error(
              "Data fornecida para getStartAndEndOfWeekISO é inválida."
            );
          }
          const dayOfWeek = targetDate.getUTCDay();
          const startDate = new Date(targetDate);
          startDate.setUTCDate(
            targetDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
          ); // Adjust to Monday (UTC)
          startDate.setUTCHours(0, 0, 0, 0);

          const endDate = new Date(startDate);
          endDate.setUTCDate(startDate.getUTCDate() + 6);
          endDate.setUTCHours(23, 59, 59, 999);

          return JSON.stringify({
            start_of_week: startDate.toISOString(),
            end_of_week: endDate.toISOString(),
          });
        }

        case "getStartAndEndOfMonthISO": {
          const targetDate = value ? new Date(value as string) : now;
          if (isNaN(targetDate.getTime())) {
            throw new Error(
              "Data fornecida para getStartAndEndOfMonthISO é inválida."
            );
          }
          const startDate = new Date(
            Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1)
          );
          startDate.setUTCHours(0, 0, 0, 0);

          const endDate = new Date(
            Date.UTC(
              targetDate.getUTCFullYear(),
              targetDate.getUTCMonth() + 1,
              0
            )
          );
          endDate.setUTCHours(23, 59, 59, 999);

          return JSON.stringify({
            start_of_month: startDate.toISOString(),
            end_of_month: endDate.toISOString(),
          });
        }

        default:
          // TypeScript should prevent this due to z.enum, but as a safeguard:
          throw new Error(`Ação desconhecida: ${action}`);
      }
    } catch (e: any) {
      return `Erro na DateTimeHelperTool (${action}): ${e.message}`;
    }
  }
}
