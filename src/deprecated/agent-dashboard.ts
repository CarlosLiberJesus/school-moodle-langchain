import { PerformanceMonitor } from "./agent-monitor.js";

export class AgentDashboard {
  static generateReport(performanceMonitor: PerformanceMonitor) {
    const summary = performanceMonitor.getMetricSummary();

    console.log("\n📈 DASHBOARD DO AGENTE");
    console.log("=====================");

    Object.entries(summary).forEach(([metric, data]) => {
      console.log(`\n${metric.toUpperCase()}:`);
      console.log(`  📊 Execuções: ${data.count}`);
      console.log(`  ⏱️  Média: ${Math.round(data.average)}ms`);
      console.log(`  ⚡ Min/Max: ${data.min}ms / ${data.max}ms`);
      console.log(`  📋 Recentes: [${data.recent.join(", ")}]ms`);
    });

    console.log("\n=====================\n");
  }
}
