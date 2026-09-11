// Manual live-API smoke test. Never commit provider credentials here.
// Usage:
//   DVLA_API_KEY=... MOT_API_KEY=... VRM=AB12CDE node dvla_test_live.js

const VRM = (process.env.VRM || 'MC21PJJ').trim().toUpperCase();
const DVLA_API_KEY = process.env.DVLA_API_KEY;
const MOT_API_KEY = process.env.MOT_API_KEY;

if (!DVLA_API_KEY || !MOT_API_KEY) {
    console.error('DVLA_API_KEY and MOT_API_KEY must be supplied via environment variables.');
    process.exit(1);
}

async function testDVLA() {
    console.log('\n=== DVLA VES API ===');
    const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
        method: 'POST',
        headers: {
            'x-api-key': DVLA_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ registrationNumber: VRM }),
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Raw DVLA response:');
    console.log(JSON.stringify(data, null, 2));
    return data;
}

async function testMOT() {
    console.log('\n=== MOT History API ===');
    const res = await fetch(`https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests?registration=${encodeURIComponent(VRM)}`, {
        method: 'GET',
        headers: {
            'x-api-key': MOT_API_KEY,
            Accept: 'application/json+v6',
        },
    });
    console.log('Status:', res.status);
    if (!res.ok) {
        console.log('Error:', await res.text());
        return null;
    }
    const data = await res.json();
    console.log('Raw MOT response:');
    console.log(JSON.stringify(data, null, 2));
    return data;
}

(async () => {
    try { await testDVLA(); } catch (e) { console.error('DVLA error:', e.message); }
    try { await testMOT(); } catch (e) { console.error('MOT error:', e.message); }
})();
