// Agent Earth — Dynamic data loader
// Reads from data/ directory structure for multi-agent, multi-travel extensibility

import alfamaMeta from '../../data/travels/alfama-lisbon/meta.json';
import alfamaOscar from '../../data/travels/alfama-lisbon/oscar.json';
import alfamaClaudie from '../../data/travels/alfama-lisbon/claudie.json';

import kyotoMeta from '../../data/travels/higashiyama-kyoto/meta.json';
import kyotoOscar from '../../data/travels/higashiyama-kyoto/oscar.json';

import shimokitaMeta from '../../data/travels/shimokitazawa-tokyo/meta.json';
import shimokitaClaudie from '../../data/travels/shimokitazawa-tokyo/claudie.json';

import oscarProfile from '../../data/agents/oscar.json';
import claudieProfile from '../../data/agents/claudie.json';

// ─── Agent Registry ───
export const agents = {
  [oscarProfile.id]: oscarProfile,
  [claudieProfile.id]: claudieProfile,
};

// ─── Build perspective index: { waypointId -> agentId -> perspective } ───
function buildPerspectives(agentDataList) {
  const index = {};
  for (const agentData of agentDataList) {
    for (const p of agentData.perspectives) {
      if (!index[p.waypointId]) index[p.waypointId] = {};
      index[p.waypointId][agentData.agentId] = p;
    }
  }
  return index;
}

// ─── Build a complete travel object ───
function buildTravel(meta, agentDataList) {
  const perspectiveIndex = buildPerspectives(agentDataList);
  const travelAgentIds = [...new Set(agentDataList.map(d => d.agentId))];

  const waypoints = meta.waypoints.map((wp) => {
    const wpPerspectives = perspectiveIndex[wp.id] || {};
    return {
      ...wp,
      hasStreetView: wp.hasStreetView !== false,
      perspectives: wpPerspectives,
      agentIds: Object.keys(wpPerspectives),
    };
  });

  return {
    meta,
    waypoints,
    agentOrder: travelAgentIds,
  };
}

// ─── All travels ───
export const travels = [
  buildTravel(shimokitaMeta, [shimokitaClaudie]),
  buildTravel(kyotoMeta, [kyotoOscar]),
  buildTravel(alfamaMeta, [alfamaOscar, alfamaClaudie]),
];

// ─── Backward-compatible exports (default to first travel) ───
export const travel = travels[0].meta;
export const waypoints = travels[0].waypoints;
export const agentOrder = travels[0].agentOrder;
