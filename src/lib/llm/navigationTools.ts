import type { LocationNode, World } from "@/types/game";

export interface LocationInfo {
    id: string;
    name: string;
    mapDescription: string;
    distance?: number;
}

export interface LocationMatch {
    id: string;
    name: string;
    mapDescription: string;
    similarity: number;
}

export interface RouteInfo {
    exists: boolean;
    path: LocationInfo[];
    totalDistance: number;
}

/**
 * Get locations directly connected to the current location
 */
export function getNearLocations(
    currentLocationId: string,
    graph: World["graph"]
): LocationInfo[] {
    const currentLocation = graph[currentLocationId];
    if (!currentLocation) {
        return [];
    }

    const results: LocationInfo[] = [];

    for (const conn of currentLocation.connections) {
        const targetLocation = graph[conn.targetId];
        if (targetLocation) {
            results.push({
                id: targetLocation.id,
                name: targetLocation.locationName,
                mapDescription: targetLocation.mapDescription || targetLocation.description || "",
                distance: 1,
            });
        }
    }

    return results;
}

/**
 * Find location by approximate name using fuzzy matching
 */
export function findLocationByName(
    rawName: string,
    graph: World["graph"]
): LocationMatch[] {
    const searchTerm = rawName.toLowerCase().trim();
    const allLocations = Object.values(graph);

    const matches: LocationMatch[] = [];

    for (const location of allLocations) {
        const locationName = location.locationName.toLowerCase();
        const description = (location.mapDescription || location.description || "").toLowerCase();

        let similarity = 0;

        if (locationName === searchTerm) {
            similarity = 1.0;
        } else if (locationName.startsWith(searchTerm)) {
            similarity = 0.9;
        } else if (locationName.includes(searchTerm)) {
            similarity = 0.8;
        } else if (description.includes(searchTerm)) {
            similarity = 0.6;
        } else {
            const words = searchTerm.split(/\s+/);
            const matchedWords = words.filter(
                (word) => locationName.includes(word) || description.includes(word)
            );
            similarity = matchedWords.length / words.length * 0.5;
        }

        if (similarity > 0.3) {
            matches.push({
                id: location.id,
                name: location.locationName,
                mapDescription: location.mapDescription || location.description || "",
                similarity,
            });
        }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches.slice(0, 5);
}

/**
 * Find shortest path between two locations using BFS
 */
export function getRoute(
    fromId: string,
    toId: string,
    graph: World["graph"]
): RouteInfo {
    if (fromId === toId) {
        const location = graph[fromId];
        return {
            exists: true,
            path: location ? [{
                id: location.id,
                name: location.locationName,
                mapDescription: location.mapDescription || location.description || "",
            }] : [],
            totalDistance: 0,
        };
    }

    const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }];
    const visited = new Set<string>([fromId]);
    const MAX_DEPTH = 7;

    while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.path.length > MAX_DEPTH) {
            continue;
        }

        const currentLocation = graph[current.id];
        if (!currentLocation) continue;

        for (const conn of currentLocation.connections) {
            const targetId = conn.targetId;

            if (targetId === toId) {
                const fullPath = [...current.path, targetId];
                const pathInfo: LocationInfo[] = [];

                for (const id of fullPath) {
                    const loc = graph[id];
                    if (loc) {
                        pathInfo.push({
                            id: loc.id,
                            name: loc.locationName,
                            mapDescription: loc.mapDescription || loc.description || "",
                        });
                    }
                }

                return {
                    exists: true,
                    path: pathInfo,
                    totalDistance: fullPath.length - 1,
                };
            }

            if (!visited.has(targetId)) {
                visited.add(targetId);
                queue.push({
                    id: targetId,
                    path: [...current.path, targetId],
                });
            }
        }
    }

    return {
        exists: false,
        path: [],
        totalDistance: -1,
    };
}

/**
 * Get formatted location description for LLM
 */
export function formatLocationInfo(location: LocationNode): string {
    const desc = location.mapDescription || location.description || "Описание отсутствует";
    return `${location.locationName}: ${desc}`;
}

/**
 * Format route as readable text
 */
export function formatRoute(route: RouteInfo): string {
    if (!route.exists || route.path.length === 0) {
        return "Маршрут не найден";
    }

    if (route.path.length === 1) {
        return `Вы уже находитесь в локации: ${route.path[0].name}`;
    }

    const steps = route.path.map((loc, idx) => {
        if (idx === 0) return `Начало: ${loc.name}`;
        if (idx === route.path.length - 1) return `Цель: ${loc.name}`;
        return `→ ${loc.name}`;
    });

    return steps.join("\n");
}
