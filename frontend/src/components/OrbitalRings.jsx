const OrbitalRings = () => {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-0 animate-fade-in-slow" style={{ animationDelay: '0.5s' }}>
      {/* Mobile-optimized rings (smaller, less intense) */}
      <div className="absolute w-32 h-32 sm:w-40 sm:h-40 md:w-60 md:h-60 rounded-full bg-gradient-to-r from-red-500/20 to-blue-500/20 blur-xl animate-pulse" />
      
      {/* Main orbital ring - scales with screen size */}
      <div className="absolute w-48 h-48 sm:w-80 sm:h-80 md:w-96 md:h-96 lg:w-120 lg:h-120 rounded-full border border-orange-400/30 sm:border-2 sm:border-orange-400/40 animate-spin" style={{ animationDuration: "20s" }}>
        <div className="absolute top-0 left-1/2 w-2 h-2 sm:w-3 sm:h-3 bg-purple-400 rounded-full -translate-x-1/2 shadow-lg shadow-purple-500/30 animate-pulse" />
      </div>
      
      {/* Secondary ring - reverse animation */}
      <div
        className="absolute w-64 h-64 sm:w-100 sm:h-100 md:w-110 md:h-110 rounded-full border border-blue-400/20 sm:border-2 sm:border-blue-400/30 animate-spin"
        style={{ animationDuration: "15s", animationDirection: "reverse" }}
      >
        <div className="absolute top-1/2 left-0 w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 bg-blue-400 rounded-full -translate-y-1/2 shadow-lg shadow-blue-500/20 animate-pulse" />
      </div>
      
      {/* Tertiary ring - slower animation */}
      <div className="absolute w-80 h-80 sm:w-120 sm:h-120 md:w-140 md:h-140 rounded-full border border-red-400/15 sm:border-1 sm:border-red-400/25 animate-spin" style={{ animationDuration: "25s" }}>
        <div className="absolute bottom-0 left-1/2 w-1 h-1 sm:w-2 sm:h-2 bg-red-400 rounded-full -translate-x-1/2 shadow-lg shadow-red-500/15 animate-pulse" />
      </div>
      
      {/* Central glow - scales appropriately */}
      <div className="absolute w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-r from-purple-500/30 to-blue-500/30 blur-xl animate-pulse opacity-20" />
    </div>
  );
};

export default OrbitalRings;