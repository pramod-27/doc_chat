import { useState, useEffect, useRef } from "react";

const LogoAnimation = ({ onStageChange }) => {
  const [stage, setStage] = useState("entrance");
  const logoRef = useRef(null);
  const targetRef = useRef(null);

  useEffect(() => {
    targetRef.current = document.querySelector("[data-logo-target]");
  }, []);

  // Faster animation sequence
  useEffect(() => {
    const timer = setTimeout(() => setStage("pulse"), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (stage === "pulse") {
      const timer = setTimeout(() => {
        setStage("transition");
        onStageChange("transitioning");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [stage, onStageChange]);

  useEffect(() => {
    if (stage === "transition") {
      const timer = setTimeout(() => {
        setStage("complete");
        onStageChange("complete");
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [stage, onStageChange]);

  // Optional: Sound effect (commented out for better UX)
  useEffect(() => {
    if (stage === "pulse") {
      // const audio = new Audio("/tudum.mp3");
      // audio.volume = 0.5;
      // audio.play().catch(() => {});
    }
  }, [stage]);

  if (stage === "complete") return null;

  const isTransitioning = stage === "transition";

  const getTargetRect = () => {
    if (!targetRef.current) {
      return { top: 16, left: 16, width: 32, height: 32 };
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
      <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-black to-red-900" />
      
      {/* Subtle pulse rings - smaller on mobile */}
      {stage === "pulse" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-red-400/20 animate-expand-ring" />
          <div className="absolute w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-red-400/10 animate-expand-ring" style={{ animationDelay: "0.2s" }} />
        </div>
      )}

      <div
        ref={logoRef}
        className="absolute transition-all duration-500 ease-out"
        style={
          isTransitioning
            ? {
                top: target.top + target.height / 2 - 16,
                left: target.left + target.width / 2 - 16,
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
          {/* Glow effect */}
          <div className={`absolute inset-0 rounded-full bg-white blur-xl animate-pulse-glow opacity-40 ${isTransitioning ? "scale-50" : ""}`} />

          {/* Main logo container */}
          <div
            className={`relative rounded-full bg-gradient-to-br from-red-600 to-pink-600 shadow-2xl flex items-center justify-center transition-all duration-500 ${
              isTransitioning ? "w-8 h-8" : "w-48 h-48 sm:w-64 sm:h-64"
            } border-2 border-white/30`}
          >
            <div
              className={`rounded-full bg-black/80 backdrop-blur-xl flex items-center justify-center transition-all duration-500 ${
                isTransitioning ? "w-6 h-6" : "w-40 h-40 sm:w-56 sm:h-56"
              }`}
            >
              <div className="text-center">
                <div
                  className={`font-black text-white transition-all duration-500 ${
                    isTransitioning ? "text-xs" : "text-4xl sm:text-6xl"
                  }`}
                  style={{
                    textShadow: "0 0 20px #ffffff, 0 0 40px #ffffff",
                  }}
                >
                  AI
                </div>
                {!isTransitioning && (
                  <div
                    className="font-bold text-white/90 tracking-widest transition-all duration-500 text-lg sm:text-2xl mt-2"
                    style={{ textShadow: "0 0 10px #ffffff" }}
                  >
                    CHAT
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading text */}
      {stage === "entrance" && (
        <div className="absolute bottom-20 sm:bottom-32 left-1/2 -translate-x-1/2 text-center">
          <div className="text-white text-lg sm:text-xl font-semibold tracking-widest animate-pulse">
            File Chat AI
          </div>
          <div className="text-white/60 text-sm sm:text-base mt-2">Loading your workspace...</div>
        </div>
      )}
    </div>
  );
};

export default LogoAnimation;