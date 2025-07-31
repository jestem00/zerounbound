/*
 * Wrapper around selectFastestRpc.  Existing modules import
 * chooseFastestRpc() to obtain the best RPC endpoint for the current
 * network.  This wrapper delegates to selectFastestRpc() exported
 * from deployTarget.js.  Timeout is passed through.
 */

import { selectFastestRpc } from '../config/deployTarget.js';

/**
 * Determine the fastest reachable RPC endpoint from the configured list.
 * If all endpoints are unreachable within the timeout, an exception
 * will be thrown.
 *
 * @param {number} timeout Timeout in milliseconds (default 2000 ms).
 * @returns {Promise<string>} The URL of the fastest reachable RPC.
 */
export async function chooseFastestRpc(timeout = 2000) {
  return selectFastestRpc(timeout);
}