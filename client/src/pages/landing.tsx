import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { PillButton } from "@/components/ui/pill-button";
import { Truck, Ghost, Gamepad2, Radio, Map } from "lucide-react";

// --- Intro Animation Component ---
function IntroAnimationView({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3500); // Slightly longer than animation to ensure smooth transition
    return () => clearTimeout(timer);
  }, [onComplete]);

  // Create an L-shaped path of dots
  // Horizontal segment: 10 dots
  const dots = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    delay: `${i * 0.25}s`
  }));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050608] overflow-hidden">
      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 arcade-scanline arcade-scanline-active opacity-30" />
      
      {/* Title */}
      <div className="mb-12 text-center z-10">
        <h1 className="text-5xl md:text-7xl font-bold text-[#facc15] arcade-pixel-font tracking-widest landing-neon mb-2">
          PINGPOINT
        </h1>
        <p className="text-[#22d3ee] arcade-pixel-font text-xs md:text-sm tracking-[0.5em] animate-pulse">
          BY SUVERSE LABS
        </p>
      </div>

      {/* Arcade Map Area */}
      <div className="relative w-[320px] h-[200px] md:w-[500px] md:h-[300px] border-4 border-[#1f2633] bg-[#02040a] rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.2)] overflow-hidden p-8 flex items-center justify-center">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#1f2937 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

        {/* Path Container */}
        <div className="relative w-full h-12 flex items-center">
          {/* Dots */}
          <div className="absolute inset-0 flex items-center justify-between px-4">
            {dots.map((dot) => (
              <div 
                key={dot.id}
                className="w-2 h-2 bg-[#facc15] rounded-full shadow-[0_0_5px_rgba(250,204,21,0.8)]"
                style={{ 
                  animation: `dot-eat 0.2s forwards`, 
                  animationDelay: `${0.2 + (dot.id * 0.25)}s`
                }}
              />
            ))}
          </div>

          {/* Truck (Pac-Man style) */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 z-20 animate-truck-move">
            <div className="relative w-full h-full text-[#facc15] drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]">
              <Truck className="w-full h-full fill-current" />
            </div>
          </div>
        </div>

        {/* Ghosts */}
        <div className="absolute top-4 right-12 animate-ghost-drift text-[#ec4899] opacity-80">
           <Ghost className="w-8 h-8 fill-current drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
        </div>
        <div className="absolute bottom-6 left-16 animate-ghost-drift text-[#22d3ee] opacity-80" style={{ animationDelay: "1.5s" }}>
           <Ghost className="w-6 h-6 fill-current drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        </div>
      </div>

      <div className="mt-8 text-[#9ca3af] arcade-pixel-font text-[10px] animate-pulse">
        LOADING ASSETS...
      </div>
    </div>
  );
}

// --- Role Selector Component ---
function RoleSelectorView() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050608] relative overflow-hidden p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#101522_0%,#050608_100%)]" />
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "linear-gradient(#1f2933 1px, transparent 1px), linear-gradient(90deg, #1f2933 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      
      <div className="z-10 flex flex-col items-center w-full max-w-3xl animate-in fade-in zoom-in duration-500">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-3 tracking-tight">
            PING<span className="text-[#facc15]">POINT</span>
          </h1>
          <p className="text-[#9ca3af] uppercase tracking-[0.4em] text-xs md:text-sm font-medium">
            by SuVerse Labs
          </p>
        </div>

        <div className="mb-8 text-center">
          <span className="inline-block px-4 py-1 rounded-full border border-[#1f2633] bg-[#101522]/50 text-[#9ca3af] text-[10px] uppercase tracking-widest backdrop-blur-sm">
            Select Your Console
          </span>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {/* Broker / Dispatcher Option */}
          <button
            onClick={() => setLocation("/app/loads?role=dispatcher")}
            className="group relative overflow-hidden rounded-2xl border border-[#1f2633] bg-[#101522] p-8 transition-all hover:border-[#facc15]/50 hover:shadow-[0_0_30px_rgba(250,204,21,0.15)] active:scale-[0.98] text-left"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity text-[#facc15]">
              <Gamepad2 className="w-24 h-24 -rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-full bg-[#facc15]/10 flex items-center justify-center text-[#facc15] mb-4 group-hover:scale-110 transition-transform duration-300">
                <Radio className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-[#facc15] transition-colors">Broker / Dispatcher</h3>
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                Create loads, manage rates, assign drivers, and track operations from the command console.
              </p>
              <div className="mt-6 flex items-center text-[#facc15] text-xs font-bold tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                Enter Console <span className="ml-2">→</span>
              </div>
            </div>
          </button>

          {/* Driver Option (Redirects to existing dashboard) */}
          <button
            onClick={() => setLocation("/driver")}
            className="group relative overflow-hidden rounded-2xl border border-[#1f2633] bg-[#101522] p-8 transition-all hover:border-[#22d3ee]/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] active:scale-[0.98] text-left"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity text-[#22d3ee]">
              <Map className="w-24 h-24 rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-full bg-[#22d3ee]/10 flex items-center justify-center text-[#22d3ee] mb-4 group-hover:scale-110 transition-transform duration-300">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-[#22d3ee] transition-colors">Driver</h3>
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                View assigned loads, manage stops, and navigate routes on the go.
              </p>
              <div className="mt-6 flex items-center text-[#22d3ee] text-xs font-bold tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                Launch App <span className="ml-2">→</span>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-12 text-[#9ca3af]/30 text-[10px] uppercase tracking-widest font-mono">
          v1.0.0 • Secure Connection Established
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  // Check localStorage to skip intro on repeat visits
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem("pingpoint_has_seen_intro") !== "true";
    }
    return true;
  });

  // Memoize callback to prevent useEffect dependency changes causing re-runs
  const handleIntroComplete = useCallback(() => {
    localStorage.setItem("pingpoint_has_seen_intro", "true");
    setShowIntro(false);
  }, []);

  return showIntro ? (
    <IntroAnimationView onComplete={handleIntroComplete} />
  ) : (
    <RoleSelectorView />
  );
}
