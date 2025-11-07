const AnimatedLogo = ({ inHeader = false, isTransitioning = false }) => {
  if (inHeader) {
    return (
      <div className={`relative group ${isTransitioning ? 'animate-fade-in-scale' : ''}`}>
        <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-red-600 to-pink-600 shadow-lg flex items-center justify-center overflow-hidden">
          <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
            <span className="text-xs font-bold text-white">AI</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default AnimatedLogo;