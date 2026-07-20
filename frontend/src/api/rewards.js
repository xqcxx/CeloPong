// Weekly reward API client. All authenticated calls take a wallet session token.
import { BACKEND_URL } from '../constants';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function fetchRewardConfig() {
  return parse(await fetch(`${BACKEND_URL}/rewards/config`));
}

export async function fetchWeeklyLeaderboard(weekKey) {
  const query = weekKey ? `?weekKey=${encodeURIComponent(weekKey)}` : '';
  return parse(await fetch(`${BACKEND_URL}/rewards/leaderboard${query}`));
}

export async function fetchMyRewards(token, weeks = 8) {
  return parse(await fetch(`${BACKEND_URL}/rewards/mine?weeks=${weeks}`, {
    headers: authHeaders(token)
  }));
}

export async function requestPayout(token, weekKey) {
  return parse(await fetch(`${BACKEND_URL}/rewards/${encodeURIComponent(weekKey)}/request`, {
    method: 'POST',
    headers: authHeaders(token)
  }));
}

export async function recordRewardClaim(token, weekKey, txHash) {
  return parse(await fetch(`${BACKEND_URL}/rewards/${encodeURIComponent(weekKey)}/claimed`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ txHash })
  }));
}

export async function fetchPendingRewards(token) {
  return parse(await fetch(`${BACKEND_URL}/rewards/admin/pending`, {
    headers: authHeaders(token)
  }));
}

export async function recordRewardApproval(token, rewardId, txHash) {
  return parse(await fetch(`${BACKEND_URL}/rewards/admin/${rewardId}/approved`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ txHash })
  }));
}

export async function reconcileRewards(token) {
  return parse(await fetch(`${BACKEND_URL}/rewards/admin/reconcile`, {
    method: 'POST',
    headers: authHeaders(token)
  }));
}
