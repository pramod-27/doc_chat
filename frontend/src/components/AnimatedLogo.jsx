const AnimatedLogo = ({ inHeader = false, isTransitioning = false }) => {
  if (inHeader) {
    return (
      <div className={`relative w-10 h-10 group ${isTransitioning ? 'animate-fade-in-scale' : ''}`}>
        {/* Netflix Red Glow */}
        <div className="absolute inset-0 rounded-full bg-red-600 blur-2xl animate-pulse-glow opacity-90" />
        
        {/* Main Circle */}
        <div className="relative w-10 h-10 rounded-full bg-black shadow-2xl flex items-center justify-center overflow-hidden border-2 border-red-600/50">
          <div className="w-8 h-8 rounded-full bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <span 
              className="text-xs font-black text-white tracking-tighter"
              style={{ textShadow: '0 0 10px #E50914' }}
            >
              AI
            </span>
          </div>

          {/* Orbiting Red Dot — shrinks with parent */}
          <div 
            className="absolute inset-0 animate-spin"
            style={{ animationDuration: "6s" }}
          >
            <div 
              className="absolute top-0 left-1/2 w-1 h-1 bg-red-500 rounded-full -translate-x-1/2 shadow-lg shadow-red-500/80"
              style={{
                boxShadow: '0 0 8px #E50914, 0 0 16px #E50914'
              }}
            />
          </div>
        </div>

        {/* Hover Ring */}
        <div className="absolute inset-0 rounded-full border-2 border-red-600/0 group-hover:border-red-600/60 transition-all duration-300" />
      </div>
    );
  }
  return null;
};

export default AnimatedLogo;