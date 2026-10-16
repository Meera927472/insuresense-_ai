# InsureSense AI — India-first, Explainable Motor Insurance Prototype

Understand Your Driving. Understand Your Premium.

This prototype preserves the existing quote, analytics, consent, review and settings workflows and adds locally stored signed trips, driver/passenger confirmation, road-context fairness, an offline sync queue, cached offline pricing, pricing explanations, a demo claims tracker, English/Tamil policy assistance, two-wheeler safety indicators, a privacy-minimal Driving Passport QR, family/fleet exposure summaries, an offline document wallet and a non-delivering SOS prototype.

Trip storage and scores are provisional until the FastAPI server verifies a device signature and hash chain. Trip location is not collected by the demo. SOS details are never delivered to emergency services or by SMS. Documents are stored in browser IndexedDB and are not encrypted at rest. Pricing, road, policy, fleet and claim information is illustrative and is not an insurer decision or guarantee. The Passport verification link reveals only the aggregate verified score, verified trip count, and integrity status.

## Setup

### Frontend
```powershell
cd client
npm install
npm start
```

### Backend
```powershell
cd server
pip install -r requirements.txt
uvicorn src.main:app --reload
```

The frontend expects the API at `http://localhost:8000`. The production build includes a lightweight service worker for caching the application shell and static assets; IndexedDB holds local trip packets and the device signing key.
