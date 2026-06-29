# MMGIS Copilot Automated Testing Documentation

## Overview
This test suite provides automated capability testing for the MMGIS Copilot, validating all major functions including layer management, navigation, temporal analysis, spatial analysis, and data comparison.

## Test Structure

### Test Categories

1. **Layer Management** (`layerManagement`)
   - List layers
   - Toggle visibility
   - Set opacity
   - Get layer information

2. **Navigation** (`navigation`)
   - Coordinate-based zoom
   - Region-based navigation
   - Zoom level control

3. **Temporal Analysis** (`temporalAnalysis`)
   - Time setting
   - Time range queries
   - Animation creation

4. **Spatial Analysis** (`spatialAnalysis`)
   - Anomaly detection
   - Spatial clustering
   - Change detection
   - Threshold highlighting

5. **Data Comparison** (`dataComparison`)
   - Multi-layer statistics
   - Data export

6. **Regional Analysis** (`regionalAnalysis`)
   - Area-based calculations
   - Mean calculations over polygons

7. **Informational** (`informational`)
   - Help queries
   - Layer descriptions

## Usage

### Quick Start (Browser Console)

1. Open MMGIS with the frozon mission:
   ```
   http://localhost:8890/?mission=frozon
   ```

2. Open browser developer console (F12)

3. Load the test runner:
   ```javascript
   // Copy and paste the contents of run-copilot-tests.js
   ```

4. Run tests:
   ```javascript
   // Quick test (3 queries)
   await quickCopilotTest()
   
   // Full test suite
   await fullCopilotTest()
   
   // Custom test
   await runCopilotTests({
       categories: ['layerManagement', 'navigation'],
       delayBetweenTests: 2000,
       verbose: true
   })
   ```

### Test Options

```javascript
runCopilotTests({
    categories: ['quickTest'],     // Array of categories or null for all
    outputFormat: 'console',       // 'console', 'html', 'json', 'csv'
    delayBetweenTests: 2000,       // Milliseconds between tests
    verbose: true                   // Show progress in console
})
```

## Test Results Interpretation

### Status Codes
- **passed** ✅: Test completed successfully with expected results
- **failed** ❌: Test did not produce expected results
- **warning** ⚠️: Test passed but with unexpected tool usage
- **expected_failure** 🔸: Known issue, failure was expected

### Success Metrics
- **Success Rate**: Percentage of tests that passed
- **Tool Match**: Whether expected tools were used
- **Response Validation**: Whether response contains expected keywords

## Known Issues

### Critical Issues
1. **REGION002**: "Invalid byte order value" error
   - Occurs when calculating mean over Beaufort Sea polygon
   - Related to geospatial data byte ordering
   - Status: Under investigation

### Minor Issues
1. **COMP001**: Multi-layer statistics validation errors
   - Tool validation rejects additional properties
   - Status: Fixed in tool-registry.json

2. **COMP002**: Data export incomplete
   - Export functionality may not be fully implemented
   - Status: Pending implementation

## Test Report Formats

### Console Output
Default format showing summary and table of results:
```
📊 TEST RESULTS SUMMARY
Total Tests: 25
Passed: 20 ✅
Failed: 5 ❌
Success Rate: 80.0%
```

### JSON Export
Complete test data with all metadata:
```javascript
{
  "timestamp": "2024-01-28T...",
  "tests": [...],
  "summary": {...}
}
```

### HTML Report
Visual report that opens in new browser window with:
- Color-coded status indicators
- Execution time metrics
- Tool usage tracking
- Error messages

## Continuous Testing

### Automated Schedule
Tests can be scheduled to run periodically:

```javascript
// Run tests every hour
setInterval(async () => {
    const results = await quickCopilotTest();
    if (results.summary.successRate < 80) {
        console.warn('⚠️ Copilot success rate below threshold!');
    }
}, 3600000);
```

### CI/CD Integration
The test suite can be integrated into CI/CD pipelines using headless browsers:
- Puppeteer
- Playwright
- Selenium WebDriver

## Extending the Test Suite

### Adding New Test Cases

Edit `copilot-capability-test.js` and add to appropriate category:

```javascript
{
    id: "NEW001",
    query: "Your test query here",
    expectedTools: ["expected_tool"],
    expectedSuccess: true,
    validation: (response) => response.includes("expected_text")
}
```

### Creating New Categories

Add new category to `testCategories`:

```javascript
newCategory: {
    name: "New Category Name",
    description: "Category description",
    tests: [
        // Test cases here
    ]
}
```

## Performance Benchmarks

Expected execution times:
- Quick test: ~10 seconds (3 queries)
- Full suite: ~3-5 minutes (30+ queries)
- Per query: 1-3 seconds average

## Troubleshooting

### Common Issues

1. **Copilot not responding**
   - Ensure MMGIS is running
   - Check browser console for errors
   - Verify AgentChat tool is enabled

2. **Tests timing out**
   - Increase `delayBetweenTests`
   - Check network connectivity
   - Verify backend services are running

3. **False failures**
   - Update expected keywords
   - Adjust validation functions
   - Check for UI changes

## Future Enhancements

1. **Visual regression testing**
   - Screenshot comparison for map states
   - Layer visibility verification

2. **Performance profiling**
   - Response time tracking
   - Memory usage monitoring

3. **Multi-mission testing**
   - Test across different mission configurations
   - Cross-browser compatibility

4. **Accessibility testing**
   - Keyboard navigation
   - Screen reader compatibility

## Contact

For issues or questions about the test suite:
- Create an issue in the MMGIS repository
- Tag with `copilot-testing`