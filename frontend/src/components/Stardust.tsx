'use client';

import { useMemo, useEffect, useState } from 'react';

interface ShootingStar {
  id: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
  angle: number;
}

export default function Stardust() {
  const [shootingStars, setShootingStars] = useState<ShootingStar[]>([]);

  const stars = useMemo(() => {
    return [...Array(50)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 3}s`,
      animationDuration: `${2 + Math.random() * 2}s`,
      size: 2 + Math.random() * 3,
    }));
  }, []);

  useEffect(() => {
    const createShootingStar = () => {
      const id = Date.now() + Math.random();
      const star: ShootingStar = {
        id,
        top: `${Math.random() * 60}%`,
        left: `${Math.random() * 50}%`,
        delay: '0s',
        duration: `${1.2 + Math.random() * 1.0}s`,
        angle: 15 + Math.random() * 30,
      };
      setShootingStars(prev => [...prev, star]);
      setTimeout(() => {
        setShootingStars(prev => prev.filter(s => s.id !== id));
      }, 3500);
    };

    const interval = setInterval(createShootingStar, 2500 + Math.random() * 3000);
    createShootingStar();
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Floating stardust particles */}
      <div className="stardust" />
      
      {/* Twinkling stars */}
      <div className="stars">
        {stars.map((star) => (
          <div
            key={star.id}
            className="star"
            style={{
              left: star.left,
              top: star.top,
              animationDelay: star.animationDelay,
              animationDuration: star.animationDuration,
              width: `${star.size}px`,
              height: `${star.size}px`,
            }}
          />
        ))}
      </div>

      {/* Shooting stars */}
      <div className="shooting-stars-container">
        {shootingStars.map((star) => (
          <div
            key={star.id}
            className="shooting-star"
            style={{
              top: star.top,
              left: star.left,
              animationDuration: star.duration,
              ['--angle' as any]: `${star.angle}deg`,
            }}
          />
        ))}
      </div>
    </>
  );
}
