import React from "react";
import { BrowserRouter as Router, NavLink, Route, Routes } from "react-router-dom";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wifi,
  MapPinned,
  Bike,
  BadgeCheck,
  CarFront,
  FolderLock,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import QuoteForm from "./pages/QuoteForm";
import DrivingAnalytics from "./pages/DrivingAnalytics";
import PremiumBreakdown from "./pages/PremiumBreakdown";
import ConsentPrivacy from "./pages/ConsentPrivacy";
import ReviewRequests from "./pages/ReviewRequests";
import Settings from "./pages/Settings";
import OfflineCenter from "./pages/OfflineCenter";
import ClaimsCenter from "./pages/ClaimsCenter";
import PolicyAssistant from "./pages/PolicyAssistant";
import RoadSafety from "./pages/RoadSafety";
import TwoWheelerMode from "./pages/TwoWheelerMode";
import DrivingPassport, { PassportVerification } from "./pages/DrivingPassport";
import FamilyFleet from "./pages/FamilyFleet";
import DocumentWallet from "./pages/DocumentWallet";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/quote", label: "Get Insurance Quote", icon: FileText },
  { to: "/analytics", label: "Driving Analytics", icon: Activity },
  { to: "/premium", label: "Premium Breakdown", icon: BarChart3 },
  { to: "/consent", label: "Consent & Privacy", icon: ShieldCheck },
  { to: "/reviews", label: "Review Requests", icon: Users },
  { to: "/offline", label: "Offline & Sync", icon: Wifi },
  { to: "/claims", label: "Claims Center", icon: ClipboardCheck },
  { to: "/policy", label: "Policy Assistant", icon: MessageCircle },
  { to: "/road-safety", label: "Road Safety", icon: MapPinned },
  { to: "/two-wheeler", label: "Two-Wheeler Mode", icon: Bike },
  { to: "/passport", label: "Driving Passport", icon: BadgeCheck },
  { to: "/family-fleet", label: "Family & Fleet", icon: CarFront },
  { to: "/documents", label: "Document Wallet", icon: FolderLock },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];

function App() {
  return (
    <Router>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-block">
            <div className="brand-mark">D</div>
            <div>
              <div className="brand-title">InsureSense AI</div>
              <small>Understand your driving. Understand your premium.</small>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-note">
            <strong>Demonstration mode</strong>
            <p>Illustrative pricing and simulated driving behaviour data only.</p>
          </div>
        </aside>

        <main className="content-panel">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/quote" element={<QuoteForm />} />
            <Route path="/analytics" element={<DrivingAnalytics />} />
            <Route path="/premium" element={<PremiumBreakdown />} />
            <Route path="/consent" element={<ConsentPrivacy />} />
            <Route path="/reviews" element={<ReviewRequests />} />
            <Route path="/offline" element={<OfflineCenter />} />
            <Route path="/claims" element={<ClaimsCenter />} />
            <Route path="/policy" element={<PolicyAssistant />} />
            <Route path="/road-safety" element={<RoadSafety />} />
            <Route path="/two-wheeler" element={<TwoWheelerMode />} />
            <Route path="/passport" element={<DrivingPassport />} />
            <Route path="/passport/verify/:token" element={<PassportVerification />} />
            <Route path="/family-fleet" element={<FamilyFleet />} />
            <Route path="/documents" element={<DocumentWallet />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
