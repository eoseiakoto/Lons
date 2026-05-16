/**
 * Sprint 15 (S15-FIX-1) — atomic Redis quota increment.
 *
 * Replaces the sequential INCR + INCRBYFLOAT + EXPIRE pattern in
 * `QuotaTrackingService.incrementDisbursement` with a single Lua script
 * that runs server-side. Removes the race window where two concurrent
 * disbursements could both see "under limit" on the INCR step and both
 * be admitted past the cap.
 *
 * Returns a 6-tuple:
 *   [newCount, newVolume, countExceeded, volumeExceeded, countWarning, volumeWarning]
 *
 * - `newCount` (integer) — post-increment count.
 * - `newVolume` (string)  — post-increment volume, returned as the raw
 *    `INCRBYFLOAT` result (Redis-formatted, no trailing zeros stripped).
 * - `countExceeded` / `volumeExceeded` (0|1) — hard limit hit.
 * - `countWarning` / `volumeWarning` (0|1) — soft warning at 80% of cap.
 *
 * KEYS:
 *   [1] count key
 *   [2] volume key
 * ARGV:
 *   [1] amountUsd (float as string)
 *   [2] txnLimit  (integer, or "-1" for unlimited)
 *   [3] volumeLimit (float as string, or "-1" for unlimited)
 *   [4] TTL seconds (set on first increment only)
 *
 * Pass limits as `-1` to disable that cap (the script never flags
 * exceeded/warning for a `-1` limit).
 */
export const QUOTA_INCREMENT_SCRIPT = `
local newCount = redis.call('INCR', KEYS[1])
local newVolume = redis.call('INCRBYFLOAT', KEYS[2], ARGV[1])

-- TTL on first increment of the period only — avoids churn on every
-- write and lets the natural Redis key expiry roll forward the period.
if newCount == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  redis.call('EXPIRE', KEYS[2], ARGV[4])
end

local txnLimit = tonumber(ARGV[2])
local volumeLimit = tonumber(ARGV[3])

local countExceeded = 0
local countWarning = 0
if txnLimit >= 0 then
  if newCount > txnLimit then
    countExceeded = 1
  elseif newCount >= math.floor(txnLimit * 0.8) then
    countWarning = 1
  end
end

local volumeExceeded = 0
local volumeWarning = 0
if volumeLimit >= 0 then
  local v = tonumber(newVolume)
  if v > volumeLimit then
    volumeExceeded = 1
  elseif v >= volumeLimit * 0.8 then
    volumeWarning = 1
  end
end

return {newCount, newVolume, countExceeded, volumeExceeded, countWarning, volumeWarning}
`;
