/**
 * MMGIS Copilot Automated Capability Testing Suite
 * 
 * This test suite validates all copilot functions by sending test queries
 * and checking for successful responses or expected error patterns.
 */

const COPILOT_TEST_SUITE = {
    testCategories: {
        layerManagement: {
            name: "Layer Management",
            description: "Tests for layer visibility, opacity, and information",
            tests: [
                {
                    id: "LM001",
                    query: "List all available layers",
                    expectedTools: ["list_layers"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Available layers") || response.includes("layers:")
                },
                {
                    id: "LM002", 
                    query: "Toggle on the SWOT freeboard layer",
                    expectedTools: ["toggle_layer"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("visible") || response.includes("turned on")
                },
                {
                    id: "LM003",
                    query: "Set SWOT freeboard opacity to 50%",
                    expectedTools: ["set_layer_opacity"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("opacity") && response.includes("50")
                },
                {
                    id: "LM004",
                    query: "What layers are currently visible?",
                    expectedTools: ["list_layers"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("visible") || response.includes("Currently")
                },
                {
                    id: "LM005",
                    query: "Describe the SWOT freeboard layer",
                    expectedTools: ["describe_layer", "layer_information"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("SWOT") || response.includes("freeboard")
                }
            ]
        },
        
        navigation: {
            name: "Navigation & Zoom",
            description: "Tests for map navigation and zoom functions",
            tests: [
                {
                    id: "NAV001",
                    query: "Zoom to coordinates -150, 75 at zoom level 6",
                    expectedTools: ["zoom_to"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Zoomed") || response.includes("-150")
                },
                {
                    id: "NAV002",
                    query: "Zoom to the Arctic Ocean",
                    expectedTools: ["zoom_to"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Arctic Ocean") || response.includes("90")
                },
                {
                    id: "NAV003",
                    query: "Zoom to Beaufort Sea",
                    expectedTools: ["zoom_to"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Beaufort") || response.includes("zoom")
                },
                {
                    id: "NAV004",
                    query: "Focus on the Chukchi Sea region",
                    expectedTools: ["zoom_to"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Chukchi") || response.includes("-168")
                }
            ]
        },
        
        temporalAnalysis: {
            name: "Time & Temporal Analysis",
            description: "Tests for time-based functions and animations",
            tests: [
                {
                    id: "TIME001",
                    query: "Set time to January 1 2024",
                    expectedTools: ["set_time", "set_visible_layers_time"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("2024") || response.includes("January")
                },
                {
                    id: "TIME002",
                    query: "What time range is available for the current layer?",
                    expectedTools: ["render_layer_information"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("time") || response.includes("range")
                },
                {
                    id: "TIME003",
                    query: "Move to latest date",
                    expectedTools: ["set_time"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("latest") || response.includes("moved")
                },
                {
                    id: "TIME004",
                    query: "Animate sea ice changes from January to December 2024",
                    expectedTools: ["time_series_animation"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("animation") || response.includes("frames")
                }
            ]
        },
        
        spatialAnalysis: {
            name: "Spatial Analysis",
            description: "Tests for spatial statistics and analysis",
            tests: [
                {
                    id: "SPATIAL001",
                    query: "Detect anomalies in SWOT November 2024 data",
                    expectedTools: ["detect_anomalies"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("anomal") || response.includes("detected")
                },
                {
                    id: "SPATIAL002",
                    query: "Show spatial clustering in freeboard data",
                    expectedTools: ["spatial_statistics"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("Moran") || response.includes("cluster")
                },
                {
                    id: "SPATIAL003",
                    query: "Calculate changes between January and November 2024",
                    expectedTools: ["change_detection"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("change") || response.includes("difference")
                },
                {
                    id: "SPATIAL004",
                    query: "Highlight areas where ice thickness is greater than 2 meters",
                    expectedTools: ["threshold_highlight"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("highlight") || response.includes("threshold")
                }
            ]
        },
        
        dataComparison: {
            name: "Data Comparison & Export",
            description: "Tests for comparing datasets and exporting",
            tests: [
                {
                    id: "COMP001",
                    query: "Compare SWOT and ICESat-2 freeboard layers",
                    expectedTools: ["multilayer_statistics"],
                    expectedSuccess: false, // Known to fail currently
                    validation: (response) => response.includes("compar") || response.includes("correlation")
                },
                {
                    id: "COMP002",
                    query: "Export current view data as CSV",
                    expectedTools: ["data_export"],
                    expectedSuccess: false, // May not be fully implemented
                    validation: (response) => response.includes("export") || response.includes("CSV")
                }
            ]
        },
        
        regionalAnalysis: {
            name: "Regional Analysis",
            description: "Tests for area-based calculations",
            tests: [
                {
                    id: "REGION001",
                    query: "Calculate mean freeboard in current view",
                    expectedTools: ["calculate_layer_mean"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("mean") || response.includes("average")
                },
                {
                    id: "REGION002",
                    query: "What is the mean ice thickness in Beaufort Sea?",
                    expectedTools: ["calculate_layer_mean"],
                    expectedSuccess: false, // Known issue: "Invalid byte order value"
                    expectedError: "Invalid byte order value",
                    validation: (response) => response.includes("Invalid byte order") || response.includes("error")
                }
            ]
        },
        
        informational: {
            name: "Information & Help",
            description: "Tests for informational queries",
            tests: [
                {
                    id: "INFO001",
                    query: "Tell me about MMGIS",
                    expectedTools: [],
                    expectedSuccess: true,
                    validation: (response) => response.includes("MMGIS") || response.includes("Multi-Mission")
                },
                {
                    id: "INFO002",
                    query: "Tell me about SWOT",
                    expectedTools: [],
                    expectedSuccess: true,
                    validation: (response) => response.includes("SWOT") || response.includes("Surface Water")
                },
                {
                    id: "INFO003",
                    query: "Explain what this layer shows",
                    expectedTools: ["layer_information"],
                    expectedSuccess: true,
                    validation: (response) => response.includes("layer") || response.includes("show")
                }
            ]
        }
    },

    /**
     * Run a single test case
     */
    async runTest(test) {
        const startTime = Date.now();
        let result = {
            id: test.id,
            query: test.query,
            status: 'pending',
            response: null,
            toolsUsed: [],
            executionTime: 0,
            error: null,
            validated: false
        };

        try {
            // Send query to copilot
            const response = await this.sendCopilotQuery(test.query);
            result.response = response.text;
            result.toolsUsed = response.tools || [];
            
            // Check if expected tools were used
            if (test.expectedTools && test.expectedTools.length > 0) {
                const toolMatch = test.expectedTools.some(tool => 
                    result.toolsUsed.includes(tool)
                );
                if (!toolMatch && test.expectedSuccess) {
                    result.status = 'warning';
                    result.error = `Expected tools not used. Expected: ${test.expectedTools.join(', ')}, Got: ${result.toolsUsed.join(', ')}`;
                }
            }

            // Validate response
            if (test.validation) {
                result.validated = test.validation(response.text);
                result.status = result.validated ? 'passed' : 'failed';
            } else {
                result.status = 'passed';
            }

            // Check for expected errors
            if (test.expectedError && response.text.includes(test.expectedError)) {
                result.status = test.expectedSuccess ? 'failed' : 'expected_failure';
            }

        } catch (error) {
            result.error = error.message;
            result.status = test.expectedSuccess ? 'failed' : 'expected_failure';
        }

        result.executionTime = Date.now() - startTime;
        return result;
    },

    /**
     * Run all tests in a category
     */
    async runCategory(categoryKey) {
        const category = this.testCategories[categoryKey];
        const results = {
            category: category.name,
            description: category.description,
            tests: [],
            summary: {
                total: category.tests.length,
                passed: 0,
                failed: 0,
                warnings: 0,
                expected_failures: 0
            }
        };

        for (const test of category.tests) {
            const result = await this.runTest(test);
            results.tests.push(result);
            
            // Update summary
            if (result.status === 'passed') results.summary.passed++;
            else if (result.status === 'failed') results.summary.failed++;
            else if (result.status === 'warning') results.summary.warnings++;
            else if (result.status === 'expected_failure') results.summary.expected_failures++;
            
            // Add delay between tests to avoid overwhelming the system
            await this.delay(1000);
        }

        return results;
    },

    /**
     * Run the complete test suite
     */
    async runFullSuite() {
        const suiteResults = {
            timestamp: new Date().toISOString(),
            environment: {
                url: window.location.href,
                mission: this.getMissionName(),
                userAgent: navigator.userAgent
            },
            categories: {},
            summary: {
                totalTests: 0,
                totalPassed: 0,
                totalFailed: 0,
                totalWarnings: 0,
                totalExpectedFailures: 0,
                executionTime: 0
            }
        };

        const startTime = Date.now();

        for (const categoryKey of Object.keys(this.testCategories)) {
            console.log(`Running category: ${categoryKey}`);
            const categoryResults = await this.runCategory(categoryKey);
            suiteResults.categories[categoryKey] = categoryResults;
            
            // Update totals
            suiteResults.summary.totalTests += categoryResults.summary.total;
            suiteResults.summary.totalPassed += categoryResults.summary.passed;
            suiteResults.summary.totalFailed += categoryResults.summary.failed;
            suiteResults.summary.totalWarnings += categoryResults.summary.warnings;
            suiteResults.summary.totalExpectedFailures += categoryResults.summary.expected_failures;
        }

        suiteResults.summary.executionTime = Date.now() - startTime;
        suiteResults.summary.successRate = 
            (suiteResults.summary.totalPassed / suiteResults.summary.totalTests * 100).toFixed(2) + '%';

        return suiteResults;
    },

    /**
     * Generate HTML report
     */
    generateHTMLReport(results) {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>MMGIS Copilot Test Report - ${results.timestamp}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
                .summary { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .category { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .test { padding: 10px; margin: 10px 0; border-left: 4px solid #ddd; background: #fafafa; }
                .test.passed { border-color: #27ae60; }
                .test.failed { border-color: #e74c3c; }
                .test.warning { border-color: #f39c12; }
                .test.expected_failure { border-color: #95a5a6; }
                .stats { display: flex; gap: 20px; }
                .stat { flex: 1; text-align: center; padding: 15px; background: #ecf0f1; border-radius: 5px; }
                .stat.passed { background: #d5f4e6; }
                .stat.failed { background: #fce4e4; }
                .stat.warning { background: #fef5e7; }
                table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #ecf0f1; }
                .error { color: #e74c3c; font-size: 12px; margin-top: 5px; }
                .tools { color: #3498db; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>MMGIS Copilot Capability Test Report</h1>
                <p>Generated: ${results.timestamp}</p>
                <p>Mission: ${results.environment.mission} | URL: ${results.environment.url}</p>
            </div>

            <div class="summary">
                <h2>Overall Summary</h2>
                <div class="stats">
                    <div class="stat">
                        <h3>${results.summary.totalTests}</h3>
                        <p>Total Tests</p>
                    </div>
                    <div class="stat passed">
                        <h3>${results.summary.totalPassed}</h3>
                        <p>Passed</p>
                    </div>
                    <div class="stat failed">
                        <h3>${results.summary.totalFailed}</h3>
                        <p>Failed</p>
                    </div>
                    <div class="stat warning">
                        <h3>${results.summary.totalWarnings}</h3>
                        <p>Warnings</p>
                    </div>
                </div>
                <p><strong>Success Rate:</strong> ${results.summary.successRate}</p>
                <p><strong>Execution Time:</strong> ${(results.summary.executionTime / 1000).toFixed(2)} seconds</p>
            </div>

            ${Object.entries(results.categories).map(([key, category]) => `
                <div class="category">
                    <h2>${category.category}</h2>
                    <p>${category.description}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Query</th>
                                <th>Status</th>
                                <th>Tools Used</th>
                                <th>Time (ms)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${category.tests.map(test => `
                                <tr class="test ${test.status}">
                                    <td>${test.id}</td>
                                    <td>${test.query}</td>
                                    <td><span class="${test.status}">${test.status.replace('_', ' ')}</span></td>
                                    <td class="tools">${test.toolsUsed.join(', ') || 'none'}</td>
                                    <td>${test.executionTime}</td>
                                </tr>
                                ${test.error ? `
                                <tr>
                                    <td colspan="5" class="error">Error: ${test.error}</td>
                                </tr>` : ''}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('')}

            <div class="category">
                <h2>Known Issues</h2>
                <ul>
                    <li><strong>REGION002:</strong> "Invalid byte order value" when calculating mean over Beaufort Sea polygon</li>
                    <li><strong>COMP001:</strong> Multi-layer statistics validation errors with additional properties</li>
                    <li><strong>COMP002:</strong> Data export functionality may not be fully implemented</li>
                </ul>
            </div>
        </body>
        </html>
        `;
        return html;
    },

    /**
     * Mock function to send query to copilot
     * In real implementation, this would use the actual API
     */
    async sendCopilotQuery(query) {
        // This would be replaced with actual API call
        // For now, returning mock response
        return {
            text: `Processing: ${query}`,
            tools: [],
            success: true
        };
    },

    /**
     * Utility functions
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    getMissionName() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mission') || 'unknown';
    },

    /**
     * Export results to JSON
     */
    exportToJSON(results) {
        const json = JSON.stringify(results, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `copilot-test-results-${Date.now()}.json`;
        a.click();
    },

    /**
     * Export results to CSV
     */
    exportToCSV(results) {
        let csv = 'Category,Test ID,Query,Status,Tools Used,Execution Time (ms),Error\\n';
        
        Object.entries(results.categories).forEach(([key, category]) => {
            category.tests.forEach(test => {
                csv += `"${category.category}","${test.id}","${test.query}","${test.status}","${test.toolsUsed.join(';')}",${test.executionTime},"${test.error || ''}"\\n`;
            });
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `copilot-test-results-${Date.now()}.csv`;
        a.click();
    }
};

// Make it available globally for console testing
window.COPILOT_TEST_SUITE = COPILOT_TEST_SUITE;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = COPILOT_TEST_SUITE;
}