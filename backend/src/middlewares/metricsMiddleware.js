/**
 * In-memory store for global API metrics
 */
const apiMetrics = {
    totalRequests: 0,
    totalResponseTime: 0,
    averageResponseTimeMs: 0
};

/**
 * Express middleware to intercept response finish event
 * and calculate response time.
 */
const trackMetrics = (req, res, next) => {
    const startAt = process.hrtime();

    res.on('finish', () => {
        const diff = process.hrtime(startAt);
        const timeInMs = diff[0] * 1000 + diff[1] / 1e6;
        
        apiMetrics.totalRequests += 1;
        apiMetrics.totalResponseTime += timeInMs;
        apiMetrics.averageResponseTimeMs = Math.round(apiMetrics.totalResponseTime / apiMetrics.totalRequests);
    });

    next();
};

const getMetrics = () => {
    return {
        requestsTracked: apiMetrics.totalRequests,
        averageResponseTimeMs: apiMetrics.averageResponseTimeMs + 'ms'
    };
};

module.exports = { trackMetrics, getMetrics };
