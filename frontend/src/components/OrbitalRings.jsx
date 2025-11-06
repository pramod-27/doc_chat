const OrbitalRings = () => {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-0 animate-fade-in-slow" style={{ animationDelay: '0.5s' }}>
      <div className="absolute w-40 h-40 rounded-full bg-gradient-to-r from-red-500 to-blue-500 blur-xl opacity-40 animate-pulse" />
      <div className="absolute w-120 h-120 rounded-full border-3 border-orange-400/60 animate-spin" style={{ animationDuration: "15s" }}>
        <div className="absolute top-0 left-1/2 w-5 h-5 bg-purple-400 rounded-full -translate-x-1/2 shadow-lg shadow-purple-500/60 animate-pulse" />
      </div>
      <div
        className="absolute w-100 h-100 rounded-full border-3 border-blue-400/60 animate-spin"
        style={{ animationDuration: "12s", animationDirection: "reverse" }}
      >
        <div className="absolute top-1/2 left-0 w-4 h-4 bg-blue-400 rounded-full -translate-y-1/2 shadow-lg shadow-blue-500/60 animate-pulse" />
      </div>
      <div className="absolute w-80 h-80 rounded-full border-2 border-red-400/40 animate-spin" style={{ animationDuration: "20s" }}>
        <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-red-400 rounded-full -translate-x-1/2 shadow-lg shadow-red-500/40 animate-pulse" />
      </div>
      <div className="absolute w-32 h-32 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 blur-xl animate-pulse" />
    </div>
  );
};

export default OrbitalRings;