import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const INITIAL_SPOTS = [
  { id: 1, label: "Charger 1" },
  { id: 2, label: "Charger 2" },
  { id: 3, label: "Charger 3" },
  { id: 4, label: "Charger 4" },
  { id: 5, label: "Charger 5" },
  { id: 6, label: "Charger 6" },
];

const HOURS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 6;
  return { value: h, label: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}` };
});

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#0a0e1a",   // page background
  surface:   "#111827",   // cards, panels
  surface2:  "#1a2235",   // raised elements inside cards
  border:    "#1f2d45",   // subtle borders
  border2:   "#2a3a52",   // slightly more visible borders
  text:      "#f0f4ff",   // primary text — high contrast
  textSub:   "#8fa3bf",   // secondary text — visible but softer
  textMuted: "#4d6280",   // tertiary / labels — clearly readable
  blue:      "#3b82f6",
  blueDim:   "#1e3a5f",
  green:     "#22c55e",
  greenDim:  "#14532d",
  cyan:      "#22d3ee",
  cyanDim:   "#0a2e38",
  amber:     "#f59e0b",
  amberDim:  "#451a03",
  red:       "#f87171",
  redDim:    "#450a0a",
  purple:    "#a78bfa",
  purpleDim: "#2e1065",
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

function getInitials(name) {
  if (!name) return "?";
  return name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function getColor(name) {
  const colors = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
  if (!name) return "#6b7280";
  let hash = 0;
  for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

function Avatar({ name, size = 36 }) {
  const bg = getColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.36,
      fontFamily: "'DM Sans', sans-serif",
      flexShrink: 0, border: "2px solid rgba(255,255,255,0.2)",
      boxShadow: `0 0 0 2px ${bg}44`
    }}>
      {getInitials(name)}
    </div>
  );
}

function TimeBar({ startH, endH }) {
  const totalHours = 12;
  const left = ((startH - 6) / totalHours) * 100;
  const width = ((endH - startH) / totalHours) * 100;
  return (
    <div style={{ position: "relative", height: 5, background: C.border2, borderRadius: 99, margin: "6px 0 12px" }}>
      <div style={{
        position: "absolute", left: `${Math.max(0, left)}%`, width: `${Math.max(width, 5)}%`,
        height: "100%", background: C.blue, borderRadius: 99
      }} />
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,8,20,0.85)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, backdropFilter: "blur(8px)"
    }} onClick={onClose}>
      <div style={{
        background: C.surface, borderRadius: "24px 24px 0 0",
        padding: "20px 22px 36px",
        width: "100%", maxWidth: 520,
        border: `1px solid ${C.border2}`,
        boxShadow: "0 -24px 80px rgba(0,0,0,0.7)"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: C.border2, borderRadius: 99, margin: "0 auto 22px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
            width: 32, height: 32, cursor: "pointer", color: C.textSub, fontSize: 14, flexShrink: 0
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 6, letterSpacing: "0.05em" }}>{label}</div>
      {children}
    </div>
  );
}

function toOccupancyMap(rows = []) {
  return (rows || []).reduce((acc, row) => {
    if (!row?.charger_id) return acc;
    acc[row.charger_id] = { name: row.user_name, startH: row.start_h, endH: row.end_h, ownerId: row.owner_id };
    return acc;
  }, {});
}

function toMaintenanceMap(rows = []) {
  return (rows || []).reduce((acc, row) => {
    if (!row?.charger_id) return acc;
    acc[row.charger_id] = row.is_active;
    return acc;
  }, {});
}

const inputStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 10,
  border: `1px solid ${C.border2}`, fontSize: 15, background: C.surface2,
  fontFamily: "'DM Sans', sans-serif", outline: "none",
  boxSizing: "border-box", color: C.text
};

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
      background: C.surface, border: `1px solid ${C.border2}`,
      borderRadius: 14, padding: "13px 24px",
      color: C.text, fontSize: 14, fontWeight: 600,
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      zIndex: 300, display: "flex", alignItems: "center", gap: 10,
      whiteSpace: "nowrap"
    }}>
      ⚡ {message}
    </div>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [nameInput, setNameInput] = useState("");
  const [recentNames, setRecentNames] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ev_recent_names") || "[]");
      setRecentNames(stored);
    } catch {}
  }, []);

  function handleLogin(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const updated = [trimmed, ...recentNames.filter(n => n.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
      localStorage.setItem("ev_recent_names", JSON.stringify(updated));
      localStorage.setItem("ev_current_user", trimmed);
    } catch {}
    onLogin(trimmed);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      background: C.bg, fontFamily: "'DM Sans', sans-serif",
      alignItems: "center", justifyContent: "center", overflow: "hidden"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; } body, html { margin: 0; padding: 0; }`}</style>
      {/* Soft radial glow instead of grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(59,130,246,0.08) 0%, transparent 70%)"
      }} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 44 }}>
          <div style={{
            width: 68, height: 68, borderRadius: 22,
            background: "linear-gradient(135deg,#22d3ee,#3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, marginBottom: 18, boxShadow: "0 8px 32px rgba(59,130,246,0.35)"
          }}>⚡</div>
          <div style={{ fontWeight: 800, color: C.text, fontSize: 26 }}>EV Spot Tracker</div>
          <div style={{ color: C.textSub, fontSize: 15, marginTop: 6 }}>Enter your name to continue</div>
        </div>

        {recentNames.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, letterSpacing: "0.06em", marginBottom: 10 }}>RECENT</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recentNames.map(n => (
                <button key={n} onClick={() => handleLogin(n)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 10,
                  background: C.surface, border: `1px solid ${C.border2}`,
                  color: C.textSub, fontWeight: 600, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit"
                }}>
                  <Avatar name={n} size={22} />
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, marginBottom: 7, letterSpacing: "0.05em" }}>YOUR NAME</div>
          <input
            style={{ ...inputStyle, fontSize: 16, padding: "14px 15px" }}
            placeholder="e.g. Gurpreet Singh"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin(nameInput)}
            autoFocus
          />
        </div>

        <button
          onClick={() => handleLogin(nameInput)}
          disabled={!nameInput.trim()}
          style={{
            width: "100%", padding: "15px 0", borderRadius: 12, border: "none",
            background: nameInput.trim() ? "linear-gradient(135deg,#3b82f6,#2563eb)" : C.surface2,
            color: nameInput.trim() ? "#fff" : C.textMuted,
            fontWeight: 800, fontSize: 16, cursor: nameInput.trim() ? "pointer" : "default",
            fontFamily: "inherit", boxShadow: nameInput.trim() ? "0 4px 20px rgba(59,130,246,0.3)" : "none"
          }}
        >Enter Dashboard</button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: C.textMuted }}>
          No password needed · your name is saved for next time
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [occupancy, setOccupancy] = useState({});
  const [waitlist, setWaitlist] = useState([]);
  const [maintenance, setMaintenance] = useState({});
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("spots");
  const [isAdmin, setIsAdmin] = useState(false);
  const [authUserId, setAuthUserId] = useState(null);
  const [adminToken, setAdminToken] = useState(null);
  const sideRef = useRef(null);
  const isMobile = useIsMobile();

  const fetchState = async () => {
    const [occRes, wlRes, mRes] = await Promise.all([
      supabase.from("occupancy").select("*").order("charger_id"),
      supabase.from("waitlist").select("*").order("joined_at"),
      supabase.from("maintenance").select("*")
    ]);

    if (!occRes.error) setOccupancy(toOccupancyMap(occRes.data));
    if (!wlRes.error) setWaitlist((wlRes.data || []).map(row => ({
      id: row.id,
      name: row.user_name,
      ownerId: row.owner_id,
      joinedAt: Date.parse(row.joined_at),
      endH: row.end_h
    })));
    if (!mRes.error) setMaintenance(toMaintenanceMap(mRes.data));
  };

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const saved = localStorage.getItem("ev_current_user");
        if (saved) setCurrentUser(saved);

        const savedAdminToken = sessionStorage.getItem("ev_admin_token");
        if (savedAdminToken) {
          setAdminToken(savedAdminToken);
          setIsAdmin(true);
        }
      } catch {
        // ignore
      }

      let userId = null;
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!userErr && userData?.user) {
        userId = userData.user.id;
      } else {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (!anonErr && anonData?.user) {
          userId = anonData.user.id;
        }
      }

      if (!userId) {
        setToast("Could not initialize user session.");
      } else {
        setAuthUserId(userId);
      }

      await fetchState();
    };

    loadInitial();
  }, []);

  useEffect(() => {
    if (!authUserId) return;

    const channel = supabase.channel("ev-tracker-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "occupancy" }, () => fetchState())
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, () => fetchState())
      .on("postgres_changes", { event: "*", schema: "public", table: "maintenance" }, () => fetchState())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fetchState();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authUserId]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (selected && sideRef.current && tab === "spots") {
      const el = sideRef.current.querySelector(`[data-spot="${selected}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected, tab]);

  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
  const currentH = now.getHours();

  const availCount = INITIAL_SPOTS.filter(s => !occupancy[s.id] && !maintenance[s.id]).length;

  async function toggleMaintenance(spotId) {
    if (!isAdmin) {
      setToast("Admin access required.");
      return;
    }

    if (!adminToken) {
      setToast("Admin session expired. Please unlock admin mode again.");
      setIsAdmin(false);
      return;
    }

    const isNowMaintenance = !maintenance[spotId];

    const response = await fetch("/api/admin-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: adminToken, action: "toggleMaintenance", spotId, isActive: isNowMaintenance })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
          try { sessionStorage.removeItem("ev_admin_token"); } catch (err) { console.warn("Failed to clear admin token", err); }
        setAdminToken(null);
        setIsAdmin(false);
      }
      setToast(`Error updating maintenance: ${result.error || "request failed"}`);
      return;
    }

    await fetchState();
    setToast(isNowMaintenance ? `Charger ${spotId} marked as under maintenance` : `Charger ${spotId} is back in service`);
  }

  function openClaim(spotId) {
    setModal({ type: "claim", spotId });
    setForm({ startH: currentH, endH: Math.min(currentH + 2, 18) });
  }

  async function submitClaim() {
    if (+form.startH >= +form.endH) {
      setToast("Start time must be before end time");
      return;
    }

    // Guard against stale UI: spot may have been claimed by someone else before submit.
    const existingClaim = occupancy[modal.spotId];
    if (existingClaim && existingClaim.ownerId !== authUserId) {
      await fetchState();
      setModal(null);
      setToast("That spot was just claimed by someone else.");
      return;
    }

    // Ensure no conflicting occupancy row before adding. This avoids requiring a unique index on charger_id.
    await supabase.from("occupancy").delete().eq("charger_id", modal.spotId);

    if (!authUserId) {
      setToast("Session missing. Please refresh and try again.");
      return;
    }

    const { error } = await supabase.from("occupancy").insert({
      charger_id: modal.spotId,
      user_name: currentUser,
      owner_id: authUserId,
      start_h: +form.startH,
      end_h: +form.endH,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error("Claim insert failed", error, { charger_id: modal.spotId, user_name: currentUser });
      // Unique conflict means another user claimed the spot between open and submit.
      if (error.code === "23505") {
        await fetchState();
        setModal(null);
        setToast("That spot was just claimed by someone else.");
        return;
      }
      setToast(`Error saving claim: ${error.message || "Please try again."}`);
      return;
    }

    await fetchState();
    setModal(null);
    setToast("Spot claimed!");
  }

  function openWaitlist() {
    setModal({ type: "waitlist" });
    setForm({ endH: Math.min(currentH + 2, 18) });
  }

  async function submitWaitlist() {
    if (waitlist.find(w => w.name.toLowerCase() === currentUser.toLowerCase())) {
      setToast("You're already on the waitlist!");
      setModal(null);
      return;
    }

    if (!authUserId) {
      setToast("Session missing. Please refresh and try again.");
      return;
    }

    const { error } = await supabase.from("waitlist").insert({
      user_name: currentUser,
      owner_id: authUserId,
      joined_at: new Date().toISOString(),
      end_h: +form.endH
    });

    if (error) {
      setToast("Error adding to waitlist. Please try again.");
      return;
    }

    await fetchState();
    setToast(`Added to waitlist — you're #${waitlist.length + 1}`);
    setModal(null);
    setTab("waitlist");
  }

  async function release(spotId) {
    const currentOccupancy = occupancy[spotId];
    if (!currentOccupancy) {
      setToast("Spot is already available.");
      return;
    }

    const isOwner = !!authUserId && currentOccupancy.ownerId === authUserId;
    if (!isAdmin && !isOwner) {
      setToast("You can only release your own spot.");
      return;
    }

    let releaseQuery = supabase.from("occupancy").delete().eq("charger_id", spotId);
    if (!isAdmin) {
      releaseQuery = releaseQuery.eq("owner_id", authUserId);
    }

    const { data: releasedRows, error: releaseErr } = await releaseQuery.select("charger_id");
    if (releaseErr) {
      setToast("Error releasing spot");
      return;
    }

    if (!isAdmin && (!releasedRows || releasedRows.length === 0)) {
      setToast("You can only release your own spot.");
      return;
    }

    if (waitlist.length > 0 && isAdmin) {
      const next = waitlist[0];
      if (!next.ownerId) {
        await fetchState();
        setToast("Spot released. Next waitlist user must rejoin to claim.");
        return;
      }

      const { error: upsertErr } = await supabase.from("occupancy").upsert({
        charger_id: spotId,
        user_name: next.name,
        owner_id: next.ownerId,
        start_h: currentH,
        end_h: next.endH,
        updated_at: new Date().toISOString()
      }, { onConflict: "charger_id" });
      if (upsertErr) {
        setToast("Error assigning next user");
        return;
      }

      const { error: deleteErr } = await supabase.from("waitlist").delete().eq("id", next.id);
      if (deleteErr) {
        setToast("Spot released, but failed to update waitlist.");
      }

      await fetchState();
      setToast(`Spot auto-assigned to ${next.name}!`);
    } else {
      await fetchState();
      setToast(waitlist.length > 0 ? "Spot released. Next person in line can claim now." : "Spot released.");
    }
  }

  async function removeFromWaitlist(id, ownerId) {
    if (!isAdmin && (!authUserId || ownerId !== authUserId)) {
      setToast("You can only remove yourself from waitlist.");
      return;
    }

    let removeQuery = supabase.from("waitlist").delete().eq("id", id);
    if (!isAdmin) {
      removeQuery = removeQuery.eq("owner_id", authUserId);
    }

    const { data: removedRows, error } = await removeQuery.select("id");
    if (error) {
      setToast("Failed to remove from waitlist");
      return;
    }

    if (!isAdmin && (!removedRows || removedRows.length === 0)) {
      setToast("You can only remove yourself from waitlist.");
      return;
    }

    await fetchState();
  }

  function formatWait(ts) {
    const time = typeof ts === "string" ? Date.parse(ts) : ts;
    if (!time || Number.isNaN(time)) {
      return "unknown";
    }
    const mins = Math.floor((Date.now() - time) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }

  const mySpot = Object.entries(occupancy).find(([, v]) => (authUserId && v.ownerId === authUserId) || v.name === currentUser);
  const myWaitPos = waitlist.findIndex(w => (authUserId && w.ownerId === authUserId) || w.name === currentUser);

  // ── Parking Map ──────────────────────────────────────────────────────────────
  const ParkingMap = ({ compact = false }) => (
    <div style={{ width: "100%", padding: compact ? "0 12px" : "0 28px", boxSizing: "border-box" }}>
      {/* Roof bar */}
      <div style={{
        width: "100%", background: C.surface,
        border: `1px solid ${C.border2}`, borderBottom: "none",
        borderRadius: "14px 14px 0 0", padding: compact ? "10px 14px 0" : "14px 18px 0",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: compact ? 9 : 11, fontWeight: 700, color: C.textMuted, letterSpacing: "0.1em" }}>COMPANY HQ · EV CHARGING LEVEL</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[32, 22, 22, 16, 16].map((w, i) => <div key={i} style={{ width: w, height: 11, background: C.bg, borderRadius: 3, border: `1px solid ${C.border}` }} />)}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {INITIAL_SPOTS.map(spot => (
            <div key={spot.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: compact ? 14 : 18, height: compact ? 18 : 22, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: "4px 4px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: C.textMuted }}>P</div>
              <div style={{ width: 2, height: 6, background: C.border2 }} />
            </div>
          ))}
        </div>
      </div>
      {/* Bay floor */}
      <div style={{
        width: "100%",
        background: "linear-gradient(180deg, #131e2e 0%, #0d1520 100%)",
        border: `1px solid ${C.border2}`, borderTop: `2px solid ${C.blue}33`,
        padding: compact ? "14px 6px 12px" : "22px 8px 16px",
      }}>
        <div style={{ display: "flex" }}>
          {INITIAL_SPOTS.map((spot, i) => {
            const occ = occupancy[spot.id];
            const isMe = occ?.name === currentUser;
            const isSelected = selected === spot.id;
            const isMaint = maintenance[spot.id];
            const avatarSize = compact ? 38 : 48;
            return (
              <div key={spot.id}
                onClick={() => !isMaint && setSelected(isSelected ? null : spot.id)}
                style={{
                  flex: 1,
                  borderLeft: i > 0 ? `1px dashed ${C.border2}` : "none",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: compact ? 6 : 10, paddingTop: 6, paddingBottom: 4,
                  cursor: isMaint ? "default" : "pointer",
                  background: isMaint ? "rgba(245,158,11,0.06)" : isSelected ? "rgba(59,130,246,0.09)" : "transparent",
                  borderRadius: 8, position: "relative",
                  transition: "background 0.15s"
                }}
              >
                {isMaint ? (
                  <div style={{
                    width: avatarSize, height: avatarSize, borderRadius: "50%",
                    border: `2px solid ${C.amber}66`, background: C.amberDim,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: compact ? 16 : 20
                  }}>🔧</div>
                ) : occ ? (
                  <div style={{ position: "relative" }}>
                    <Avatar name={occ.name} size={avatarSize} />
                    {isMe && <div style={{
                      position: "absolute", top: -3, right: -3,
                      width: 14, height: 14, borderRadius: "50%",
                      background: C.cyan, border: `2px solid #0d1520`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 7, color: "#0d1520", fontWeight: 900
                    }}>✓</div>}
                    <div style={{
                      position: "absolute", bottom: -1, right: -1,
                      width: 12, height: 12, borderRadius: "50%",
                      background: C.green, border: "2px solid #0d1520"
                    }} />
                  </div>
                ) : (
                  <div style={{
                    width: avatarSize, height: avatarSize, borderRadius: "50%",
                    border: `2px dashed ${isSelected ? C.blue : C.border2}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: isSelected ? C.blue : C.textMuted, fontSize: compact ? 11 : 13, fontWeight: 700
                  }}>EV</div>
                )}
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: compact ? 16 : 22, fontWeight: 700,
                  color: isMaint ? C.amber : isSelected ? C.text : C.textSub
                }}>{spot.id}</span>
                {isSelected && !isMaint && <div style={{ position: "absolute", inset: 0, border: `1px solid ${C.blue}44`, borderRadius: 8, pointerEvents: "none" }} />}
              </div>
            );
          })}
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${C.border2},transparent)`, marginTop: compact ? 10 : 14 }} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, letterSpacing: "0.2em" }}>DRIVE LANE</div>
        </div>
      </div>
    </div>
  );

  // ── Legend ───────────────────────────────────────────────────────────────────
  const legendItems = [
    { color: C.green,  label: "In Use" },
    { color: C.cyan,   label: "Your spot" },
    { color: C.border2, label: "Available", dashed: true },
    { color: C.amber,  label: "Maintenance", dashed: true },
  ];

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  const TabBar = () => (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.surface }}>
      {["spots", "waitlist"].map(t => (
        <button key={t} onClick={() => setTab(t)} style={{
          flex: 1, padding: "14px 0", background: "transparent", border: "none",
          borderBottom: `2px solid ${tab === t ? C.blue : "transparent"}`,
          color: tab === t ? C.text : C.textSub,
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", letterSpacing: "0.04em", textTransform: "uppercase",
          transition: "color 0.15s"
        }}>
          {t === "spots" ? `Spots (${INITIAL_SPOTS.length})` : `Waitlist${waitlist.length > 0 ? ` (${waitlist.length})` : ""}`}
        </button>
      ))}
    </div>
  );

  // ── Spots list ───────────────────────────────────────────────────────────────
  const SpotsList = () => INITIAL_SPOTS.map(spot => {
    const occ = occupancy[spot.id];
    const isMe = !!occ && ((authUserId && occ.ownerId === authUserId) || occ.name === currentUser);
    const isSelected = selected === spot.id;
    const isMaint = maintenance[spot.id];
    return (
      <div key={spot.id} data-spot={spot.id}
        onClick={() => setSelected(isSelected ? null : spot.id)}
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${C.border}`,
          cursor: "pointer",
          background: isMaint ? "#140d00" : isMe ? "#071a0e" : isSelected ? C.surface2 : "transparent",
          borderLeft: `3px solid ${isMaint ? C.amber : isMe ? C.cyan : isSelected ? C.blue : "transparent"}`,
          transition: "background 0.15s"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMaint || occ ? 6 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 14 }}>🅿️</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: isMaint ? C.amber : C.text }}>{spot.label}</span>
            {isMaint && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 5, padding: "2px 7px" }}>MAINTENANCE</span>}
            {isMe && !isMaint && <span style={{ fontSize: 10, fontWeight: 700, color: C.cyan, background: C.cyanDim, borderRadius: 5, padding: "2px 7px" }}>YOU</span>}
          </div>
          {isMaint
            ? <span style={{ fontSize: 18 }}>🔧</span>
            : occ
              ? <Avatar name={occ.name} size={28} />
              : <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.border2 }} />}
        </div>

        {isMaint && (
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 6 }}>This charger is currently out of service</div>
        )}

        {!isMaint && occ && (
          <>
            <div style={{ fontSize: 13, color: C.textSub, fontWeight: 600, marginBottom: 3 }}>{occ.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textMuted, marginBottom: 2 }}>
              <span>{HOURS.find(h => h.value === occ.startH)?.label}</span>
              <span>{HOURS.find(h => h.value === occ.endH)?.label}</span>
            </div>
            <TimeBar startH={occ.startH} endH={occ.endH} />
          </>
        )}

        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); toggleMaintenance(spot.id); }}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 8,
              border: `1px solid ${isMaint ? C.amber + "66" : C.border2}`,
              background: isMaint ? C.amberDim : "transparent",
              color: isMaint ? C.amber : C.textSub,
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 8
            }}
          >{isMaint ? "🔧 Mark as Back in Service" : "🔧 Mark as Under Maintenance"}</button>
        )}

        {!isAdmin && !isMaint && (
          <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
            {!occ ? (
              <>
                <button onClick={e => { e.stopPropagation(); openClaim(spot.id); }} style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                  background: C.greenDim, color: C.green, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                }}>Claim Spot</button>
                <button onClick={e => { e.stopPropagation(); openWaitlist(); }} style={{
                  flex: 1, padding: "9px 0", borderRadius: 8,
                  border: `1px solid ${C.purpleDim}`, background: "transparent",
                  color: C.purple, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                }}>+ Waitlist</button>
              </>
            ) : (
              <>
                <button style={{
                  flex: 1, padding: "9px 0", borderRadius: 8,
                  border: `1px solid ${C.border2}`, background: "transparent",
                  color: C.textSub, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                }}>Details</button>
                {(isMe || isAdmin) ? (
                  <button onClick={e => { e.stopPropagation(); release(spot.id); }} style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                    background: C.redDim, color: C.red, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                  }}>Release</button>
                ) : (
                  <button disabled style={{
                    flex: 1, padding: "9px 0", borderRadius: 8,
                    border: `1px solid ${C.border2}`, background: "transparent",
                    color: C.textMuted, fontSize: 13, fontWeight: 700, cursor: "not-allowed", fontFamily: "inherit"
                  }}>In Use</button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  });

  // ── Waitlist content ─────────────────────────────────────────────────────────
  const WaitlistContent = () => (
    <div>
      {waitlist.length === 0 ? (
        <div style={{ padding: "52px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🕐</div>
          <div style={{ color: C.textSub, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No one waiting</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 20 }}>Join the queue to be notified when a spot opens</div>
          <button onClick={openWaitlist} style={{
            padding: "10px 22px", borderRadius: 10,
            border: `1px solid ${C.purpleDim}`, background: "transparent",
            color: C.purple, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
          }}>+ Join Waitlist</button>
        </div>
      ) : (
        <>
          <div style={{ padding: "12px 16px 6px" }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, letterSpacing: "0.07em" }}>QUEUE — first in line gets next available spot</div>
          </div>
          {waitlist.map((entry, idx) => {
            const isMe = (authUserId && entry.ownerId === authUserId) || entry.name === currentUser;
            return (
              <div key={entry.id} style={{
                padding: "13px 16px", borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 12,
                background: isMe ? "#140f00" : "transparent",
                borderLeft: `3px solid ${isMe ? C.amber : "transparent"}`
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: idx === 0 ? C.blueDim : C.surface2,
                  border: `1px solid ${idx === 0 ? C.blue : C.border2}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  fontSize: 13, color: idx === 0 ? C.blue : C.textSub
                }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <Avatar name={entry.name} size={24} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
                    {idx === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueDim, borderRadius: 5, padding: "2px 6px", flexShrink: 0 }}>NEXT</span>}
                    {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 5, padding: "2px 6px", flexShrink: 0 }}>YOU</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>Joined {formatWait(entry.joinedAt)} · until {HOURS.find(h => h.value === entry.endH)?.label}</div>
                </div>
                {(isMe || isAdmin) ? (
                  <button onClick={() => removeFromWaitlist(entry.id, entry.ownerId)} style={{
                    background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16, padding: "4px", borderRadius: 6, flexShrink: 0
                  }}>✕</button>
                ) : (
                  <button disabled style={{
                    background: "transparent", border: "none", color: C.textMuted, cursor: "not-allowed", fontSize: 16, padding: "4px", borderRadius: 6, flexShrink: 0, opacity: 0.4
                  }}>✕</button>
                )}
              </div>
            );
          })}
          <div style={{ padding: "12px 16px" }}>
            <button onClick={openWaitlist} style={{
              width: "100%", padding: "10px 0", borderRadius: 10,
              border: `1px dashed ${C.purpleDim}`, background: "transparent",
              color: C.purple, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
            }}>+ Add Another Person</button>
          </div>
        </>
      )}
    </div>
  );

  const claimRangeValid = (form.startH != null && form.endH != null ? +form.startH < +form.endH : true);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: C.bg, fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; } body, html { margin: 0; padding: 0; }`}</style>

      {/* TOP BAR */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: isMobile ? "0 14px" : "0 22px",
        height: isMobile ? 52 : 56,
        background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg,#22d3ee,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, boxShadow: "0 2px 8px rgba(59,130,246,0.4)" }}>⚡</div>
            <span style={{ fontWeight: 800, color: C.text, fontSize: isMobile ? 14 : 15 }}>EV Spot Tracker</span>
          </div>
          {!isMobile && (
            <>
              <div style={{ width: 1, height: 18, background: C.border }} />
              <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 8, padding: "4px 12px", fontSize: 13, color: C.textSub, fontWeight: 600 }}>
                {todayLabel}
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 10 }}>
          {!isMobile && waitlist.length > 0 && (
            <div style={{ background: C.amberDim, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 700, color: C.amber }}>
              {waitlist.length} waiting
            </div>
          )}
          <div style={{
            background: availCount > 0 ? "#071a0e" : C.redDim,
            border: `1px solid ${availCount > 0 ? C.green + "55" : C.red + "55"}`,
            borderRadius: 8, padding: "5px 11px", fontSize: isMobile ? 12 : 13, fontWeight: 700,
            color: availCount > 0 ? C.green : C.red
          }}>{availCount}/{INITIAL_SPOTS.length}{!isMobile && " Available"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: isMobile ? "5px 8px 5px 6px" : "5px 12px 5px 8px" }}>
            <Avatar name={currentUser} size={24} />
            {!isMobile && <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{currentUser}</span>}
            <button
              onClick={() => { try { localStorage.removeItem("ev_current_user"); } catch {} setCurrentUser(null); }}
              style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 13, padding: "0 0 0 4px", fontFamily: "inherit" }}
            >✕</button>
          </div>
          <button
            onClick={() => {
              if (isAdmin) {
                try { sessionStorage.removeItem("ev_admin_token"); } catch (err) { console.warn("Failed to clear admin token", err); }
                setAdminToken(null);
                setIsAdmin(false);
              } else {
                setModal({ type: "adminLogin" });
              }
            }}
            style={{
              padding: "5px 10px", borderRadius: 8,
              border: `1px solid ${isAdmin ? C.amber + "88" : C.border2}`,
              background: isAdmin ? C.amberDim : C.surface2,
              color: isAdmin ? C.amber : C.textMuted,
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em"
            }}
          >{isAdmin ? "⚙ ADMIN" : "⚙"}</button>
        </div>
      </div>

      {/* Status banner */}
      {(mySpot || myWaitPos >= 0) && (
        <div style={{
          background: mySpot ? "#071a0e" : "#140f00",
          borderBottom: `1px solid ${mySpot ? C.green + "33" : C.amber + "33"}`,
          padding: isMobile ? "8px 14px" : "9px 22px",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0
        }}>
          <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: mySpot ? C.green : C.amber, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {mySpot
              ? `⚡ Charging at Charger ${mySpot[0]} · until ${HOURS.find(h => h.value === mySpot[1].endH)?.label}`
              : `🕐 Waitlist position #${myWaitPos + 1}`}
          </span>
          {mySpot && (
            <button onClick={() => release(+mySpot[0])} style={{
              flexShrink: 0, padding: "5px 14px", borderRadius: 7, border: "none",
              background: C.redDim, color: C.red, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit"
            }}>Release</button>
          )}
          {myWaitPos >= 0 && (
            <button onClick={() => removeFromWaitlist(waitlist[myWaitPos].id, waitlist[myWaitPos].ownerId)} style={{
              flexShrink: 0, padding: "5px 14px", borderRadius: 7, border: "none",
              background: C.amberDim, color: C.amber, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit"
            }}>Leave</button>
          )}
        </div>
      )}

      {/* ── MOBILE layout ── */}
      {isMobile ? (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Map section */}
          <div style={{
            background: "radial-gradient(ellipse 100% 120% at 50% 80%, #0d1e35 0%, #0a0e1a 65%)",
            padding: "22px 0 18px", flexShrink: 0
          }}>
            <ParkingMap compact={true} />
            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16, flexWrap: "wrap", padding: "0 14px" }}>
              {legendItems.map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: l.dashed ? "transparent" : l.color, border: l.dashed ? `2px dashed ${l.color}` : "none", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.textSub, fontWeight: 600 }}>{l.label}</span>
                </div>
              ))}
              <button onClick={openWaitlist} style={{
                padding: "6px 14px", borderRadius: 8,
                background: C.purpleDim + "aa", border: `1px solid ${C.purple}44`,
                color: C.purple, fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6
              }}>
                Join Waitlist {waitlist.length > 0 && <span style={{ background: C.purple, color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11 }}>{waitlist.length}</span>}
              </button>
            </div>
          </div>

          {/* List panel */}
          <div style={{ flex: 1, background: C.surface }}>
            <TabBar />
            {tab === "spots" && <SpotsList />}
            {tab === "waitlist" && <WaitlistContent />}
          </div>
        </div>
      ) : (
        /* ── DESKTOP layout ── */
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Parking lot */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "stretch", justifyContent: "center",
            position: "relative", overflow: "hidden",
            background: "radial-gradient(ellipse 90% 70% at 50% 60%, #0d1e35 0%, #0a0e1a 70%)"
          }}>
            <div style={{ position: "relative", zIndex: 1, width: "100%", padding: "0 32px", boxSizing: "border-box" }}>
              <ParkingMap compact={false} />
            </div>
            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 28, zIndex: 1, padding: "0 60px", boxSizing: "border-box" }}>
              {legendItems.map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.dashed ? "transparent" : l.color, border: l.dashed ? `2px dashed ${l.color}` : "none", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.textSub, fontWeight: 600 }}>{l.label}</span>
                </div>
              ))}
              <div style={{ width: 1, height: 18, background: C.border }} />
              <button onClick={openWaitlist} style={{
                padding: "8px 18px", borderRadius: 10,
                background: C.purpleDim + "aa", border: `1px solid ${C.purple}44`,
                color: C.purple, fontWeight: 700, fontSize: 13,
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8
              }}>
                Join Waitlist {waitlist.length > 0 && <span style={{ background: C.purple, color: "#fff", borderRadius: 99, padding: "1px 8px", fontSize: 12 }}>{waitlist.length}</span>}
              </button>
            </div>
          </div>

          {/* Side panel */}
          <div style={{ width: 310, background: C.surface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column" }}>
            <TabBar />
            <div ref={sideRef} style={{ overflowY: "auto", flex: 1 }}>
              {tab === "spots" && <SpotsList />}
              {tab === "waitlist" && <WaitlistContent />}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN LOGIN MODAL */}
      {modal?.type === "adminLogin" && (() => {
        const AdminModal = () => {
          const [pw, setPw] = useState("");
          const [isSubmitting, setIsSubmitting] = useState(false);
          const attempt = async () => {
            if (isSubmitting) return;
            setIsSubmitting(true);
            try {
              const response = await fetch("/api/admin-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pw })
              });
              const result = await response.json().catch(() => ({}));

              if (!response.ok || !result.token) {
                setToast(result.error || "Incorrect passcode");
                return;
              }

              try { sessionStorage.setItem("ev_admin_token", result.token); } catch (err) { console.warn("Failed to persist admin token", err); }
              setAdminToken(result.token);
              setIsAdmin(true);
              setModal(null);
              setToast("Admin mode enabled");
            } finally {
              setIsSubmitting(false);
            }
          };
          return (
            <Modal title="Admin Access" subtitle="Enter the admin passcode to manage charger status" onClose={() => setModal(null)}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface2, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.amberDim, border: `1px solid ${C.amber}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚙️</div>
                <div>
                  <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>Admin Mode</div>
                  <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Enables maintenance toggling on all spots</div>
                </div>
              </div>
              <Field label="PASSCODE">
                <input type="password" style={inputStyle} placeholder="Enter admin passcode"
                  autoFocus value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()} />
              </Field>
              <button onClick={attempt} disabled={isSubmitting} style={{
                width: "100%", padding: "14px 0", borderRadius: 11, border: "none",
                background: isSubmitting ? C.surface2 : "linear-gradient(135deg,#b45309,#92400e)",
                color: isSubmitting ? C.textMuted : "#fff", fontWeight: 800, fontSize: 15,
                cursor: isSubmitting ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: 6
              }}>{isSubmitting ? "Checking..." : "Unlock Admin"}</button>
            </Modal>
          );
        };
        return <AdminModal />;
      })()}

      {/* CLAIM MODAL */}
      {modal?.type === "claim" && (
        <Modal title={`Claim · Charger ${modal.spotId}`} subtitle={`Claiming as ${currentUser}`} onClose={() => setModal(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface2, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
            <Avatar name={currentUser} size={36} />
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{currentUser}</div>
              <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Charger {modal.spotId}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="START TIME">
              <select style={inputStyle} value={form.startH} onChange={e => setForm(f => ({ ...f, startH: +e.target.value }))}>
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </Field>
            <Field label="END TIME">
              <select style={inputStyle} value={form.endH} onChange={e => setForm(f => ({ ...f, endH: +e.target.value }))}>
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </Field>
          </div>
          {!claimRangeValid && (
            <div style={{ color: C.red, fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
              Start time must be earlier than end time.
            </div>
          )}
          <button onClick={submitClaim} disabled={!claimRangeValid} style={{
            width: "100%", padding: "14px 0", borderRadius: 11, border: "none",
            background: claimRangeValid ? "linear-gradient(135deg,#16a34a,#15803d)" : C.surface2,
            color: claimRangeValid ? "#fff" : C.textMuted, fontWeight: 800, fontSize: 15,
            cursor: claimRangeValid ? "pointer" : "not-allowed", fontFamily: "inherit", marginTop: 6,
            boxShadow: claimRangeValid ? "0 4px 16px rgba(34,197,94,0.25)" : "none"
          }}>Claim Spot</button>
        </Modal>
      )}

      {/* WAITLIST MODAL */}
      {modal?.type === "waitlist" && (
        <Modal
          title="Join the Waitlist"
          subtitle={waitlist.length > 0 ? `${waitlist.length} person${waitlist.length !== 1 ? "s" : ""} ahead of you` : "You'll be first in line!"}
          onClose={() => setModal(null)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.surface2, borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
            <Avatar name={currentUser} size={36} />
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{currentUser}</div>
              <div style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Position #{waitlist.length + 1} in queue</div>
            </div>
          </div>
          {waitlist.length > 0 && (
            <div style={{ background: C.surface2, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, marginBottom: 10, letterSpacing: "0.06em" }}>CURRENT QUEUE</div>
              {waitlist.slice(0, 3).map((w, i) => (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: i < Math.min(waitlist.length, 3) - 1 ? 8 : 0 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.textMuted, width: 18 }}>#{i + 1}</span>
                  <Avatar name={w.name} size={22} />
                  <span style={{ fontSize: 13, color: C.textSub, fontWeight: 600 }}>{w.name}</span>
                </div>
              ))}
              {waitlist.length > 3 && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>+{waitlist.length - 3} more in queue</div>}
            </div>
          )}
          <Field label="NEED SPOT UNTIL">
            <select style={inputStyle} value={form.endH} onChange={e => setForm(f => ({ ...f, endH: +e.target.value }))}>
              {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </Field>
          <button onClick={submitWaitlist} style={{
            width: "100%", padding: "14px 0", borderRadius: 11, border: "none",
            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", marginTop: 6,
            boxShadow: "0 4px 16px rgba(124,58,237,0.3)"
          }}>Join Waitlist</button>
        </Modal>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
