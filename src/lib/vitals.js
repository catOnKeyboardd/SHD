// Owner: vitals (Binah). The only file that knows which SDK is used.
//
// startScan(onVitals) calls onVitals repeatedly with:
//   { hr, hrv, stress, bp, rr, quality }   e.g. { hr: 92, hrv: 35, stress: 6.1, bp: '128/84', rr: 18, quality: 'good' }
// and returns a stop() function.
export function startScan(onVitals) {
  throw new Error('startScan not implemented');
}
