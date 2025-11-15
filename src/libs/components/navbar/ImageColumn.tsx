import { useRef, useEffect } from 'react';

interface ImageColumnProps {
  translateY: number;
  hoveredLink: string | null;
  direction: 'left' | 'right';
  isMenuOpen: boolean;
}

interface ImageConfig {
  src: string;
  alt: string;
  hoverKey: string;
  grayscaleDefault?: string;
}

export const ImageColumn: React.FC<ImageColumnProps> = ({ translateY, hoveredLink, direction, isMenuOpen }) => {
  const columnRef = useRef<HTMLDivElement>(null);
  const currentYRef = useRef<number>(0);
  const targetYRef = useRef<number>(0);

  useEffect(() => {
    targetYRef.current = translateY;
  }, [translateY]);

  useEffect(() => {
    if (!columnRef.current) return;

    let animationFrameId: number;

    const animate = () => {
      if (!columnRef.current) return;

      // Linear interpolation for smooth movement
      const lerp = (start: number, end: number, factor: number) => {
        return start + (end - start) * factor;
      };

      // Smoothing factor (0.1 = very smooth, 0.3 = responsive)
      const smoothingFactor = 0.15;
      
      currentYRef.current = lerp(currentYRef.current, targetYRef.current, smoothingFactor);

      // Apply the transform
      columnRef.current.style.transform = `translate3d(0, ${currentYRef.current}px, 0)`;

      // Continue animation loop
      animationFrameId = requestAnimationFrame(animate);
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isMenuOpen]); // Only restart loop when menu opens/closes
  const leftImages: ImageConfig[] = [
    {
      src: "/nav_pictures/home.jpg",
      alt: "Home",
      hoverKey: "home",
      grayscaleDefault: "grayscale-0"
    },
    {
      src: "/nav_pictures/journey.jpg",
      alt: "Journey",
      hoverKey: "journey",
      grayscaleDefault: "grayscale-0"
    }
  ];

  const rightImages: ImageConfig[] = [
    {
      src: "/nav_pictures/garage.jpg",
      alt: "Garage",
      hoverKey: "garage",
      grayscaleDefault: "grayscale-30"
    },
    {
      src: "/nav_pictures/partners.jpg",
      alt: "Partners",
      hoverKey: "partners",
      grayscaleDefault: "grayscale-0"
    }
  ];

  const images = direction === 'left' ? leftImages : rightImages;
  
  // Same delay for all images
  const imageDelay = '0.4s';

  return (
    <div 
      ref={columnRef}
      className="flex-col hidden gap-8 md:flex"
      style={{ 
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)'
      }}
    >
      {images.map((image) => {
        const motionClass = isMenuOpen
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4";
        
        return (
          <div 
            key={image.hoverKey} 
            className={`relative ${motionClass}`}
            style={{
              width: 'clamp(100px, 20vw, 360px)',
              height: 'clamp(100px, 20vw, 360px)',
              transition: "opacity 0.5s ease, transform 0.6s ease",
              transitionDelay: isMenuOpen ? imageDelay : "0s",
            }}
          >
            <img 
              src={image.src} 
              alt={image.alt} 
              className={`object-cover w-full h-full shadow-lg transition-all duration-300 ${
                hoveredLink === image.hoverKey ? image.grayscaleDefault : 'grayscale'
              }`}
            />
            <div 
              className={`absolute inset-0 bg-background transition-opacity duration-300 ${
                hoveredLink === image.hoverKey ? 'opacity-0' : 'opacity-40'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
};
