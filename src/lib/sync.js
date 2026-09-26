// Owner: dashboard/logic
// Kiosk and dashboard tabs share patient updates over BroadcastChannel (no server).
const channel = new BroadcastChannel('shd-patients');

export function publishPatient(patient) {
  channel.postMessage(patient);
}

export function onPatient(callback) {
  const handler = (e) => callback(e.data);
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}
