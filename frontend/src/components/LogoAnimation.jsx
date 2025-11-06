// src/components/LogoAnimation.jsx
import { useState, useEffect, useRef } from "react";

const LogoAnimation = ({ onStageChange }) => {
  const [stage, setStage] = useState("entrance");
  const logoRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    targetRef.current = document.querySelector("[data-logo-target]");
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setStage("pulse"), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (stage === "pulse") {
      const timer = setTimeout(() => {
        setStage("transition");
        onStageChange("transitioning");
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [stage, onStageChange]);

  useEffect(() => {
    if (stage === "transition") {
      const timer = setTimeout(() => {
        setStage("complete");
        onStageChange("complete");
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [stage, onStageChange]);

  // TUDUM SOUND
  useEffect(() => {
    if (stage === "pulse") {
      const audio = new Audio("/tudum.mp3");
      audio.volume = 0.7;
      audio.play().catch(() => {});
    }
  }, [stage]);

  if (stage === "complete") return null;

  const isTransitioning = stage === "transition";

  const getTargetRect = () => {
    if (!targetRef.current) {
      return { top: 16, left: 16, width: 40, height: 40 };
    }
    const rect = targetRef.current.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    };
  };

  const target = getTargetRect();

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
      {/* Softer, whiter background */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-black to-red-900" />
      <div className="absolute inset-0 bg-gradient-radial from-red/10 blur-3xl animate-pulse-slow" />

      {/* Subtle white pulse rings */}
      {stage === "pulse" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-32 h-32 rounded-full border-8 border-red/30 animate-expand-ring" />
          <div className="absolute w-40 h-40 rounded-full border-4 border-red/20 animate-expand-ring" style={{ animationDelay: "0.2s" }} />
        </div>
      )}

      <div
        ref={logoRef}
        className="absolute transition-all duration-1000 ease-out"
        style={
          isTransitioning
            ? {
                top: target.top + target.height / 2 - 20,
                left: target.left + target.width / 2 - 20,
                transform: "translate(0, 0)",
              }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <div className={`relative ${stage === "entrance" ? "animate-netflix-entrance" : ""}`}>
          {/* White glow instead of red */}
          <div className={`absolute inset-0 rounded-full bg-white blur-3xl animate-pulse-glow opacity-60 ${isTransitioning ? "scale-50" : ""}`} />

          <div
            className={`relative rounded-full bg-red shadow-2xl flex items-center justify-center transition-all duration-1000 ${
              isTransitioning ? "w-10 h-10" : "w-80 h-80"
            } border-4 border-white/40`}
          >
            <div
              className={`rounded-full bg-black/90 backdrop-blur-xl flex items-center justify-center transition-all duration-1000 ${
                isTransitioning ? "w-8 h-8" : "w-72 h-72"
              }`}
            >
              <div className="text-center">
                <div
                  className={`font-black text-white tracking-tighter transition-all duration-1000 ${
                    isTransitioning ? "text-xs" : "text-9xl"
                  }`}
                  style={{
                    textShadow: "0 0 40px #ffffff, 0 0 80px #ffffff",
                    letterSpacing: isTransitioning ? "0" : "-0.1em",
                  }}
                >
                  AI
                </div>
                <div
                  className={`font-bold text-white/90 tracking-widest transition-all duration-1000 ${
                    isTransitioning ? "text-0 opacity-0" : "text-3xl mt-2"
                  }`}
                  style={{ textShadow: "0 0 20px #ffffff" }}
                >
                  CHAT
                </div>
              </div>
            </div>

            {/* Soft white orbiting dot */}
            <div
              className={`absolute inset-0 animate-spin transition-all duration-1000 ${isTransitioning ? "opacity-0 scale-0" : "opacity-100"}`}
              style={{ animationDuration: "8s" }}
            >
              <div
                className={`absolute top-0 left-1/2 bg-white rounded-full -translate-x-1/2 shadow-lg transition-all duration-1000 ${
                  isTransitioning ? "w-0 h-0" : "w-5 h-5"
                }`}
                style={{
                  boxShadow: isTransitioning ? "none" : "0 0 16px #ffffff, 0 0 32px #ffffff",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Clean white “TUDUM” */}
      {stage === "entrance" && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center">
          <div className="text-white text-2xl font-bold tracking-widest animate-pulse" style={{ textShadow: "0 0 30px #ffffff" }}>
            Initializing AI engine...
          </div>
          <div className="text-white/60 text-xl mt-4">loading...</div>
        </div>
      )}
    </div>
  );
};

export default LogoAnimation;