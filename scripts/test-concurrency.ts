/**
 * Token Consumption Concurrency Test - "The Casino Stress Test"
 *
 * Tests race condition handling in token consumption logic by simulating
 * 10 concurrent batches, each making 10 sequential 1-token tool calls
 * (100 tokens total attempted) against a user with exactly 100 tokens.
 *
 * Expected outcome: All 10 batches succeed, final balance = 0 tokens.
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TestConfig {
  apiUrl: string;                    // Production worker URL
  apiKey: string;                    // Test user API key
  userId: string;                    // Test user ID
  concurrentBatches: number;         // Number of concurrent batches
  callsPerBatch: number;             // Sequential calls per batch
  tokensPerCall: number;             // Cost per tool call
  initialBalance: number;            // Expected starting balance
}

const CONFIG: TestConfig = {
  apiUrl: 'https://open-sky.wtyczki.ai/mcp',
  apiKey: 'wtyk_d5a40c331f9d9b25f40fae8c4469477b31574d4d6f65b5aedd335a505422aee6',
  userId: 'test-concurrency-001',
  concurrentBatches: 10,
  callsPerBatch: 10,
  tokensPerCall: 1,
  initialBalance: 100,
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CallResult {
  batchId: number;
  callId: number;
  success: boolean;
  statusCode: number;
  responseTime: number;
  tokensConsumed: number;
  error?: string;
  actionId: string;
}

interface BatchResult {
  batchId: number;
  callResults: CallResult[];
  successfulCalls: number;
  failedCalls: number;
  totalTokensConsumed: number;
  batchDuration: number;
}

interface TestMetrics {
  totalBatches: number;
  successfulBatches: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokensConsumed: number;
  testDuration: number;
  averageCallTime: number;
  maxCallTime: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique action ID for idempotency protection
 */
function generateActionId(batchId: number, callId: number): string {
  const timestamp = Date.now();
  const random = crypto.randomUUID();
  return `test-batch-${batchId}-call-${callId}-${timestamp}-${random}`;
}

/**
 * Execute a single tool call (getAircraftByIcao)
 */
async function executeToolCall(
  config: TestConfig,
  batchId: number,
  callId: number,
  actionId: string
): Promise<CallResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `batch-${batchId}-call-${callId}`,
        method: 'tools/call',
        params: {
          name: 'getAircraftByIcao',
          arguments: {
            icao24: '3c6444', // Example ICAO24 code
          },
        },
      }),
    });

    const responseTime = Date.now() - startTime;
    const body = await response.json();

    // Check if successful
    const success = response.status === 200 && body.result && !body.error;

    return {
      batchId,
      callId,
      success,
      statusCode: response.status,
      responseTime,
      tokensConsumed: success ? config.tokensPerCall : 0,
      error: body.error?.message || (success ? undefined : 'Unknown error'),
      actionId,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      batchId,
      callId,
      success: false,
      statusCode: 0,
      responseTime,
      tokensConsumed: 0,
      error: error instanceof Error ? error.message : String(error),
      actionId,
    };
  }
}

/**
 * Execute a batch of sequential tool calls
 */
async function executeBatchOfCalls(
  config: TestConfig,
  batchId: number
): Promise<BatchResult> {
  const batchStartTime = Date.now();
  const callResults: CallResult[] = [];
  let successfulCalls = 0;
  let totalTokensConsumed = 0;

  for (let callId = 0; callId < config.callsPerBatch; callId++) {
    const actionId = generateActionId(batchId, callId);
    const result = await executeToolCall(config, batchId, callId, actionId);
    callResults.push(result);

    if (result.success) {
      successfulCalls++;
      totalTokensConsumed += result.tokensConsumed;
    } else {
      // Stop batch if a call fails (insufficient balance)
      console.log(`❌ Batch ${batchId} stopped at call ${callId}: ${result.error}`);
      break;
    }
  }

  const batchDuration = Date.now() - batchStartTime;

  return {
    batchId,
    callResults,
    successfulCalls,
    failedCalls: callResults.length - successfulCalls,
    totalTokensConsumed,
    batchDuration,
  };
}

/**
 * Calculate test metrics from batch results
 */
function calculateMetrics(
  batchResults: BatchResult[],
  testDuration: number
): TestMetrics {
  let totalCalls = 0;
  let successfulCalls = 0;
  let failedCalls = 0;
  let totalTokensConsumed = 0;
  let totalCallTime = 0;
  let maxCallTime = 0;

  for (const batch of batchResults) {
    totalCalls += batch.callResults.length;
    successfulCalls += batch.successfulCalls;
    failedCalls += batch.failedCalls;
    totalTokensConsumed += batch.totalTokensConsumed;

    for (const call of batch.callResults) {
      totalCallTime += call.responseTime;
      maxCallTime = Math.max(maxCallTime, call.responseTime);
    }
  }

  const successfulBatches = batchResults.filter(
    (b) => b.successfulCalls === CONFIG.callsPerBatch
  ).length;

  return {
    totalBatches: batchResults.length,
    successfulBatches,
    totalCalls,
    successfulCalls,
    failedCalls,
    totalTokensConsumed,
    testDuration,
    averageCallTime: totalCalls > 0 ? totalCallTime / totalCalls : 0,
    maxCallTime,
  };
}

/**
 * Print test results in a formatted way
 */
function printResults(metrics: TestMetrics, config: TestConfig): void {
  console.log('\n' + '='.repeat(70));
  console.log('  🎰 THE CASINO STRESS TEST - RESULTS');
  console.log('='.repeat(70));

  console.log('\n📊 TEST CONFIGURATION:');
  console.log(`   Target URL: ${config.apiUrl}`);
  console.log(`   User ID: ${config.userId}`);
  console.log(`   Initial Balance: ${config.initialBalance} tokens`);
  console.log(`   Concurrent Batches: ${config.concurrentBatches}`);
  console.log(`   Calls Per Batch: ${config.callsPerBatch}`);
  console.log(`   Expected Total Consumption: ${config.initialBalance} tokens`);

  console.log('\n📈 TEST RESULTS:');
  console.log(`   Test Duration: ${metrics.testDuration}ms`);
  console.log(`   Total Batches: ${metrics.totalBatches}`);
  console.log(`   Successful Batches: ${metrics.successfulBatches} ✅`);
  console.log(`   Failed Batches: ${metrics.totalBatches - metrics.successfulBatches} ❌`);
  console.log(`   Total Calls: ${metrics.totalCalls}`);
  console.log(`   Successful Calls: ${metrics.successfulCalls} ✅`);
  console.log(`   Failed Calls: ${metrics.failedCalls} ❌`);
  console.log(`   Tokens Consumed: ${metrics.totalTokensConsumed} tokens`);

  console.log('\n⏱️  PERFORMANCE:');
  console.log(`   Average Call Time: ${metrics.averageCallTime.toFixed(2)}ms`);
  console.log(`   Max Call Time: ${metrics.maxCallTime}ms`);

  console.log('\n🎯 EXPECTED vs ACTUAL:');
  const expectedBatches = config.concurrentBatches;
  const expectedCalls = config.concurrentBatches * config.callsPerBatch;
  const expectedTokens = config.initialBalance;

  const batchMatch = metrics.successfulBatches === expectedBatches;
  const callMatch = metrics.successfulCalls === expectedCalls;
  const tokenMatch = metrics.totalTokensConsumed === expectedTokens;

  console.log(`   Successful Batches: ${metrics.successfulBatches} / ${expectedBatches} ${batchMatch ? '✅' : '❌'}`);
  console.log(`   Successful Calls: ${metrics.successfulCalls} / ${expectedCalls} ${callMatch ? '✅' : '❌'}`);
  console.log(`   Tokens Consumed: ${metrics.totalTokensConsumed} / ${expectedTokens} ${tokenMatch ? '✅' : '❌'}`);

  // Final verdict
  console.log('\n🏁 FINAL VERDICT:');
  if (batchMatch && callMatch && tokenMatch) {
    console.log('   ✅ TEST PASSED! Token consumption is concurrency-safe.');
    console.log('   All batches completed successfully with exact token consumption.');
  } else {
    console.log('   ❌ TEST FAILED! Unexpected behavior detected.');
    if (!batchMatch) {
      console.log(`   - Expected ${expectedBatches} successful batches, got ${metrics.successfulBatches}`);
    }
    if (!callMatch) {
      console.log(`   - Expected ${expectedCalls} successful calls, got ${metrics.successfulCalls}`);
    }
    if (!tokenMatch) {
      console.log(`   - Expected ${expectedTokens} tokens consumed, got ${metrics.totalTokensConsumed}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n💡 NEXT STEPS:');
  console.log('   1. Query final balance in D1:');
  console.log('      npx wrangler d1 execute TOKEN_DB --remote \\');
  console.log(`        --command="SELECT current_token_balance FROM users WHERE user_id = '${config.userId}'"`);
  console.log('   2. Check for duplicate action_ids:');
  console.log('      npx wrangler d1 execute TOKEN_DB --remote \\');
  console.log(`        --command="SELECT action_id, COUNT(*) FROM mcp_actions WHERE user_id = '${config.userId}' GROUP BY action_id HAVING COUNT(*) > 1"`);
  console.log('   3. Review transaction log:');
  console.log('      npx wrangler d1 execute TOKEN_DB --remote \\');
  console.log(`        --command="SELECT COUNT(*), SUM(token_amount), MIN(balance_after) FROM transactions WHERE user_id = '${config.userId}'"`);
  console.log('');
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runConcurrencyTest(config: TestConfig): Promise<void> {
  console.log('\n🚀 Starting "The Casino Stress Test"...\n');
  console.log(`📡 Target: ${config.apiUrl}`);
  console.log(`👤 User: ${config.userId}`);
  console.log(`💰 Initial Balance: ${config.initialBalance} tokens`);
  console.log(`🔄 Pattern: ${config.concurrentBatches} concurrent batches × ${config.callsPerBatch} sequential calls`);
  console.log(`🎯 Expected: ${config.concurrentBatches} successful batches, ${config.initialBalance} tokens consumed, final balance = 0\n`);

  console.log('⏳ Launching concurrent batches...\n');

  const testStartTime = Date.now();

  // Execute all batches concurrently
  const batchPromises = Array.from({ length: config.concurrentBatches }, (_, batchId) =>
    executeBatchOfCalls(config, batchId)
  );

  const batchResults = await Promise.all(batchPromises);

  const testDuration = Date.now() - testStartTime;

  // Calculate and print metrics
  const metrics = calculateMetrics(batchResults, testDuration);
  printResults(metrics, config);
}

// ============================================================================
// RUN THE TEST
// ============================================================================

runConcurrencyTest(CONFIG).catch((error) => {
  console.error('\n❌ Test execution failed:', error);
  process.exit(1);
});
