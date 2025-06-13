import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { LLMResult } from "@langchain/core/outputs";
import { Document } from "@langchain/core/documents";

interface AgentStats {
  startTime: number;
  toolCalls: Array<{
    tool: string;
    input: any;
    output: any;
    duration: number;
    timestamp: number;
  }>;
  llmCalls: number;
  totalDuration: number;
  status: "running" | "completed" | "error";
}

export class CustomAgentMonitor extends BaseCallbackHandler {
  name = "CustomAgentMonitor";
  private stats!: AgentStats;
  private currentToolStart: number = 0;

  constructor(private logLevel: "minimal" | "detailed" | "debug" = "minimal") {
    super();
    this.resetStats();
  }

  private resetStats() {
    this.stats = {
      startTime: Date.now(),
      toolCalls: [],
      llmCalls: 0,
      totalDuration: 0,
      status: "running",
    };
  }

  // Início de execução do agente
  handleChainStart(chain: any, inputs: any) {
    if (chain.lc_namespace?.includes("agents")) {
      console.log(
        `🤖 [Agent] Iniciando: "${inputs.input?.substring(0, 100)}..."`
      );
      this.resetStats();
    }
  }

  // Chamadas de ferramentas
  handleToolStart(tool: any, input: string) {
    this.currentToolStart = Date.now();

    if (this.logLevel === "debug") {
      console.log(
        `🔧 [Tool Start] ${tool.name}: ${JSON.stringify(input).substring(
          0,
          200
        )}...`
      );
    } else {
      console.log(`🔧 [Tool] ${tool.name}`);
    }
  }

  handleToolEnd(output: string, tool: any) {
    const duration = Date.now() - this.currentToolStart;

    this.stats.toolCalls.push({
      tool: tool.name,
      input: JSON.parse(tool.input || "{}"),
      output: output.substring(0, 500), // Limitar output nos logs
      duration,
      timestamp: Date.now(),
    });

    if (this.logLevel === "debug") {
      console.log(
        `✅ [Tool End] ${tool.name} (${duration}ms): ${output.substring(
          0,
          100
        )}...`
      );
    } else {
      console.log(`✅ [Tool] ${tool.name} (${duration}ms)`);
    }
  }

  handleToolError(err: Error, tool: any) {
    console.log(`❌ [Tool Error] ${tool?.name}: ${err.message}`);
  }

  // Chamadas LLM
  handleLLMStart(llm: any, prompts: string[]) {
    this.stats.llmCalls++;
    if (this.logLevel === "debug") {
      console.log(`🧠 [LLM Call #${this.stats.llmCalls}]`);
    }
  }

  handleLLMEnd(output: LLMResult) {
    if (this.logLevel === "debug") {
      console.log(
        `🧠 [LLM Response] Tokens: ${
          output.llmOutput?.tokenUsage?.totalTokens || "N/A"
        }`
      );
    }
  }

  // Ações do agente (quando decide que ferramenta usar)
  handleAgentAction(action: AgentAction) {
    if (this.logLevel !== "minimal") {
      console.log(
        `🎯 [Agent Decision] Ferramenta: ${
          action.tool
        }, Razão: ${action.log?.substring(0, 150)}...`
      );
    }
  }

  // Final da execução
  handleChainEnd(outputs: any) {
    this.stats.totalDuration = Date.now() - this.stats.startTime;
    this.stats.status = "completed";

    console.log(`\n📊 [Resumo da Execução]`);
    console.log(`⏱️  Duração total: ${this.stats.totalDuration}ms`);
    console.log(`🔧 Ferramentas usadas: ${this.stats.toolCalls.length}`);
    console.log(`🧠 Chamadas LLM: ${this.stats.llmCalls}`);

    if (this.logLevel !== "minimal") {
      console.log(
        `📋 Sequência de ferramentas: ${this.stats.toolCalls
          .map((t) => t.tool)
          .join(" → ")}`
      );
    }

    console.log(`✨ Resposta: "${outputs.output?.substring(0, 200)}..."`);
    console.log(`─────────────────────────────────────\n`);
  }

  handleChainError(err: Error) {
    this.stats.status = "error";
    console.log(`💥 [Agent Error] ${err.message}`);
  }

  // Método para obter estatísticas
  getStats(): AgentStats {
    return { ...this.stats };
  }

  // Método para exportar logs em formato estruturado
  exportLogs() {
    return {
      ...this.stats,
      exportedAt: new Date().toISOString(),
    };
  }
}

// agent-tracer.ts - Alternativa usando LangSmith (se quiseres usar)
export class LangSmithTracer {
  constructor(private projectName: string = "moodle-agent") {}

  getTracingConfig() {
    return {
      callbacks: [
        // Se tiveres LangSmith configurado:
        // new LangChainTracer({ projectName: this.projectName })
      ],
      tags: ["moodle", "educational-ai"],
      metadata: {
        version: "1.0",
        environment: process.env.NODE_ENV || "development",
      },
    };
  }
}

// performance-monitor.ts - Monitor de performance
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  getAverageMetric(name: string): number {
    const values = this.metrics.get(name) || [];
    return values.length > 0
      ? values.reduce((a, b) => a + b) / values.length
      : 0;
  }

  getMetricSummary() {
    const summary: Record<string, any> = {};

    for (const [name, values] of this.metrics.entries()) {
      summary[name] = {
        count: values.length,
        average: this.getAverageMetric(name),
        min: Math.min(...values),
        max: Math.max(...values),
        recent: values.slice(-5), // Últimos 5 valores
      };
    }

    return summary;
  }

  reset() {
    this.metrics.clear();
  }
}

// structured-logger.ts - Logger estruturado
export class StructuredLogger {
  constructor(private level: "info" | "debug" | "error" = "info") {}

  logAgentStart(input: string, context?: any) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "agent_start",
        input: input.substring(0, 200),
        context,
      })
    );
  }

  logToolExecution(toolName: string, duration: number, success: boolean) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "tool_execution",
        tool: toolName,
        duration_ms: duration,
        success,
      })
    );
  }

  logAgentComplete(totalDuration: number, toolsUsed: string[]) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        event: "agent_complete",
        total_duration_ms: totalDuration,
        tools_used: toolsUsed,
        tools_count: toolsUsed.length,
      })
    );
  }
}
