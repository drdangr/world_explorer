import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceRadial,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  mapDescription?: string;
  isEntry?: boolean;
  isPlayerHere?: boolean;
  depth?: number; // расстояние от центральной ноды
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  bidirectional?: boolean;
}

export interface GraphLayoutOptions {
  width: number;
  height: number;
  centerNodeId?: string; // ID центральной ноды для радиального размещения
  nodeRadius: number;
  linkDistance: number;
  chargeStrength: number;
  radialStrength: number;
  centerStrength: number;
  animationDuration?: number;
  distanceMax?: number;
  alphaDecay?: number;
  velocityDecay?: number;
}

export class GraphLayoutEngine {
  private simulation: any;
  private nodes: GraphNode[] = [];
  private links: GraphLink[] = [];
  private options: Required<GraphLayoutOptions>;
  private onUpdate?: (nodes: GraphNode[]) => void;
  private onComplete?: (nodes: GraphNode[]) => void;

  constructor(options: GraphLayoutOptions) {
    this.options = {
      width: options.width || 800,
      height: options.height || 600,
      centerNodeId: options.centerNodeId,
      nodeRadius: options.nodeRadius || 80,
      linkDistance: options.linkDistance || 200,
      chargeStrength: options.chargeStrength || -1000,
      radialStrength: options.radialStrength || 0.5,
      centerStrength: options.centerStrength || 0.1,
      animationDuration: options.animationDuration || 300,
      distanceMax: options.distanceMax || 1000, // Default limit for repulsion
      alphaDecay: options.alphaDecay || 0.05,
      velocityDecay: options.velocityDecay || 0.4,
    };

    this.initSimulation();
  }

  private initSimulation() {
    const { width, height, linkDistance, chargeStrength, centerStrength, alphaDecay, velocityDecay, distanceMax } = this.options;

    this.simulation = forceSimulation<GraphNode>()
      .alphaDecay(alphaDecay)
      .velocityDecay(velocityDecay)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>()
          .id((d) => d.id)
          .distance(() => this.options.linkDistance)
          .strength(1)
      )
      .force(
        "charge",
        forceManyBody()
          .strength(chargeStrength)
          .distanceMax(distanceMax) // Limit repulsion range
      )
      .force("center", forceCenter(width / 2, height / 2).strength(centerStrength))
      .force("collide", forceCollide(this.options.nodeRadius * 2))
      .on("tick", () => {
        if (this.onUpdate) {
          this.onUpdate(this.nodes);
        }
      })
      .on("end", () => {
        if (this.onComplete) {
          this.onComplete(this.nodes);
        }
      });
  }

  /**
   * Расчет глубины узлов относительно центрального узла (BFS)
   */
  private calculateNodeDepths(centerNodeId: string): Map<string, number> {
    const depths = new Map<string, number>();
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: centerNodeId, depth: 0 }];

    visited.add(centerNodeId);
    depths.set(centerNodeId, 0);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      // Находим все связи для текущего узла
      this.links.forEach((link) => {
        let neighborId: string | null = null;

        const sourceId = typeof link.source === "object" ? link.source.id : link.source;
        const targetId = typeof link.target === "object" ? link.target.id : link.target;

        if (sourceId === id && !visited.has(targetId)) {
          neighborId = targetId;
        } else if (targetId === id && !visited.has(sourceId)) {
          neighborId = sourceId;
        }

        if (neighborId) {
          visited.add(neighborId);
          depths.set(neighborId, depth + 1);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      });
    }

    // Для несвязанных узлов устанавливаем максимальную глубину
    this.nodes.forEach((node) => {
      if (!depths.has(node.id)) {
        depths.set(node.id, 999);
      }
    });

    return depths;
  }

  /**
   * Обновление данных графа и пересчет раскладки
   */
  public updateGraph(
    nodes: GraphNode[],
    links: GraphLink[],
    options?: Partial<GraphLayoutOptions>,
    initialPositions?: Map<string, { x: number; y: number }>
  ) {
    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.nodes = nodes;
    this.links = links;

    // Smart Initialization: Position new nodes in a spiral if they don't have positions
    const centerX = this.options.width / 2;
    const centerY = this.options.height / 2;
    const spiralStep = this.options.nodeRadius * 2.5;

    this.nodes.forEach((node, index) => {
      // If node has a saved position (from initialPositions), use it
      const savedPos = initialPositions?.get(node.id);
      if (savedPos) {
        node.x = savedPos.x;
        node.y = savedPos.y;
        return;
      }

      // If node already has coordinates (e.g. from previous tick), keep them
      if (node.x !== undefined && node.y !== undefined && node.x !== 0 && node.y !== 0) {
        return;
      }

      // Otherwise, place in a spiral pattern
      // Skip index 0 (center) if we want it exactly at center, but spiral handles it fine
      const angle = index * 0.5; // Radians
      const radius = spiralStep * Math.sqrt(index);

      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });

    // Обновляем центр и другие силы в соответствии с новыми опциями
    const centerForce = this.simulation.force("center");
    if (centerForce && typeof (centerForce as any).x === "function") {
      (centerForce as any).x(this.options.width / 2);
      (centerForce as any).y(this.options.height / 2);
      if (typeof (centerForce as any).strength === "function" && this.options.centerStrength) {
        (centerForce as any).strength(this.options.centerStrength);
      }
    }

    this.simulation.force("collide", forceCollide(this.options.nodeRadius * 2));

    // Update charge force with new distanceMax if changed
    const chargeForce = this.simulation.force("charge");
    if (chargeForce) {
      chargeForce.strength(this.options.chargeStrength);
      if (this.options.distanceMax) {
        chargeForce.distanceMax(this.options.distanceMax);
      }
    }

    // Расчет глубины узлов, если указан центральный узел
    if (this.options.centerNodeId) {
      const depths = this.calculateNodeDepths(this.options.centerNodeId);
      this.nodes.forEach((node) => {
        node.depth = depths.get(node.id) ?? 999;
      });

      // Применяем радиальную силу на основе глубины
      const { width, height, linkDistance, radialStrength } = this.options;
      const centerX = width / 2;
      const centerY = height / 2;

      this.simulation
        .force(
          "radial",
          forceRadial<GraphNode>(
            (d) => (d.depth || 0) * linkDistance * 0.8,
            centerX,
            centerY
          ).strength((d) => {
            // Сильнее для узлов с определенной глубиной
            return d.depth === 999 ? 0 : radialStrength;
          })
        );
    } else {
      // Убираем радиальную силу если нет центрального узла
      this.simulation.force("radial", null);
    }

    // Обновляем силы симуляции
    this.simulation.nodes(this.nodes);
    const linkForce = this.simulation.force("link");
    if (linkForce) {
      linkForce.links(this.links);
    }

    if (initialPositions && initialPositions.size > 0) {
      this.applyPositions(initialPositions);
    }

    // Перезапуск симуляции
    this.simulation.alpha(1).restart();
  }

  /**
   * Установка позиции узла (для интерактивного перетаскивания)
   */
  public setNodePosition(nodeId: string, x: number, y: number, fixed = false) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.x = x;
      node.y = y;
      if (fixed) {
        node.fx = x; // Фиксированная позиция
        node.fy = y;
      }
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Освобождение фиксированной позиции узла
   */
  public releaseNode(nodeId: string) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.fx = null;
      node.fy = null;
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Установка колбэков для обновления визуализации
   */
  public onTick(callback: (nodes: GraphNode[]) => void) {
    this.onUpdate = callback;
  }

  public onSimulationEnd(callback: (nodes: GraphNode[]) => void) {
    this.onComplete = callback;
  }

  /**
   * Остановка симуляции
   */
  public stop() {
    this.simulation.stop();
  }

  /**
   * Получение текущих позиций узлов
   */
  public getNodePositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    this.nodes.forEach((node) => {
      if (node.x !== undefined && node.y !== undefined) {
        positions.set(node.id, { x: node.x, y: node.y });
      }
    });
    return positions;
  }

  /**
   * Применение сохраненных позиций к узлам
   */
  public applyPositions(positions: Map<string, { x: number; y: number }>) {
    this.nodes.forEach((node) => {
      const pos = positions.get(node.id);
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
        node.vx = 0;
        node.vy = 0;
        // Можно также зафиксировать позицию
        // node.fx = pos.x;
        // node.fy = pos.y;
      }
    });
    this.simulation.alpha(0).restart(); // Мягкий перезапуск для применения позиций
  }

  /**
   * Центрирование графа в видимой области
   */
  public centerGraph() {
    const { width, height } = this.options;
    const bounds = this.getGraphBounds();

    if (bounds) {
      const graphWidth = bounds.maxX - bounds.minX;
      const graphHeight = bounds.maxY - bounds.minY;
      const graphCenterX = (bounds.maxX + bounds.minX) / 2;
      const graphCenterY = (bounds.maxY + bounds.minY) / 2;

      const offsetX = width / 2 - graphCenterX;
      const offsetY = height / 2 - graphCenterY;

      this.nodes.forEach((node) => {
        if (node.x !== undefined && node.y !== undefined) {
          node.x += offsetX;
          node.y += offsetY;
        }
      });

      this.simulation.alpha(0).restart();
    }
  }

  /**
   * Получение границ графа
   */
  private getGraphBounds() {
    if (this.nodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach((node) => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      }
    });

    return { minX, maxX, minY, maxY };
  }
}
