export const productionReadinessOperations = {
    '/operations/metrics': 'scrapeOperationalMetricsV1',
};

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

export function checkProductionReadinessContract(openApi) {
    const operation = openApi.paths['/operations/metrics']?.get;
    const operationsSecurity = Object.entries(openApi.components.securitySchemes ?? {}).find(
        ([, scheme]) => scheme.type === 'apiKey' && scheme.in === 'header' && scheme.name === 'X-Operations-Key'
    );
    assert(operation?.operationId === 'scrapeOperationalMetricsV1', 'Metrics operation must remain versioned.');
    assert(
        operationsSecurity !== undefined &&
            operation.security?.some((requirement) => Object.keys(requirement).includes(operationsSecurity[0])),
        'Metrics must require its operations API key.'
    );

    const response = operation.responses?.['200'];
    const headers = response?.headers ?? {};
    assert(headers['Cache-Control'] !== undefined, 'Metrics must be no-store.');
    assert(headers['X-Metrics-Schema-Version'] !== undefined, 'Metrics must expose its independent schema version.');
    assert(
        response?.content?.['application/openmetrics-text; version=1.0.0; charset=utf-8'] !== undefined,
        'Metrics must use the versioned OpenMetrics media type.'
    );

    const healthSchema = openApi.components.schemas.HealthResponse;
    assert(
        Object.keys(healthSchema.properties).sort().join(',') === 'checkedAt,requestId,status',
        'Public health responses must not expose dependency, build or infrastructure details.'
    );
}
