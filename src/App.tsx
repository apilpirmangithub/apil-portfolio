/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  History,
  Play, 
  Cpu, 
  PenTool, 
  ExternalLink, 
  ChevronRight, 
  Image as ImageIcon,
  Film,
  Zap,
  Sparkles,
  ArrowRight,
  Maximize2,
  Minimize2,
  X,
  Instagram,
  Twitter
} from "lucide-react";
import { SKILLS, PORTFOLIO_ITEMS } from "./constants";
import { db } from "./lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import AdminPanel from "./components/AdminPanel";

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-14 text-center">
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      whileInView={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-3 mb-3"
    >
      <div className="h-[1px] w-8 bg-brand-primary" />
      <span className="inline-block text-sm font-bold tracking-[0.4em] text-brand-primary uppercase -mr-[0.4em]">{subtitle || "Overview"}</span>
      <div className="h-[1px] w-8 bg-brand-primary" />
    </motion.div>
    <motion.h2 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      className="text-4xl md:text-6xl font-display font-medium text-ink-900 tracking-tight leading-none"
    >
      {title}
    </motion.h2>
  </div>
);

const MediaRenderer = ({ item, isExpanded = false, isPlayingInline = false }: { item: any; isExpanded?: boolean; isPlayingInline?: boolean }) => {
  let displayUrl = item.thumbnail || "";

  // Handle Google Drive Links
  const gdriveMatch = displayUrl.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/) || displayUrl.match(/id=([^\/\?&]+)/);
  const fileId = gdriveMatch ? gdriveMatch[1] : null;

  const isVideo = item.category === 'Video';

  if (fileId && isVideo) {
    return (
      <div className={`w-full transition-all duration-500 ${isExpanded ? 'h-screen' : 'aspect-video'}`}>
        <iframe
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          className="w-full h-full border-0 pointer-events-auto"
          allow="autoplay"
          allowFullScreen
        ></iframe>
      </div>
    );
  }

  if (fileId) {
    displayUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  if (isVideo) {
    if (!isExpanded && !isPlayingInline) {
      return (
        <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
          <img 
            src={item.poster || displayUrl.replace('.mp4', '.jpg')} 
            alt={item.title || "Video thumbnail"}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:bg-brand-primary/90">
              <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
            </div>
          </div>
        </div>
      );
    }

    const ytMatch = displayUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/);
    if (ytMatch) {
      const videoId = ytMatch[1].split('&')[0];
      return (
        <div className={`w-full transition-all duration-500 ${isExpanded ? 'h-screen' : 'aspect-video'}`}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            className="w-full h-full border-0 pointer-events-auto"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      );
    }
    
    const vimeoMatch = displayUrl.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(.+)/);
    if (vimeoMatch) {
      const videoId = vimeoMatch[1];
      return (
        <div className={`w-full transition-all duration-500 ${isExpanded ? 'h-screen' : 'aspect-video'}`}>
          <iframe
            src={`https://player.vimeo.com/video/${videoId}?autoplay=1`}
            className="w-full h-full border-0 pointer-events-auto"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      );
    }

    if (item.forceLetterbox) {
      return (
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          <video 
            src={displayUrl} 
            poster={item.poster}
            className={`w-full h-full ${isPlayingInline ? 'object-cover' : 'object-contain'}`}
            controls
            autoPlay={isExpanded || isPlayingInline}
            playsInline
            muted={false}
            loop
          />
        </div>
      );
    }

    return (
      <video 
        src={displayUrl} 
        poster={item.poster}
        className={`w-full h-full ${isPlayingInline ? 'object-cover aspect-video' : 'object-contain'} transition-all duration-500 ${isExpanded ? 'max-h-screen bg-black/60' : 'bg-black'}`}
        controls
        autoPlay={isExpanded || isPlayingInline}
        playsInline
        muted={false}
        loop
      />
    );
  }

  return (
    <img 
      src={displayUrl} 
      alt={item.title}
      className={`w-full h-auto transition-all duration-700 ${isExpanded ? 'max-h-screen object-contain' : 'group-hover:scale-105'}`}
      referrerPolicy="no-referrer"
    />
  );
};

function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);


  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | number | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) {
        heroVideoRef.current?.pause();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!selectedItem) setIsExpanded(false);
  }, [selectedItem]);

  useEffect(() => {
    const q = query(collection(db, 'portfolio'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const baseItems = items.length > 0 ? items : PORTFOLIO_ITEMS;
  const filteredItems = baseItems.filter(item => item.category === 'Video').map((item, index) => {
    let title = item.title;
    if (item.title === 'Stop Motion Ads' || index === 0) title = 'That Will Never Work - Trailer';
    else if (index === 1) title = 'Masa Tua - Indonesian Short Film';
    else if (index === 2) title = 'Football Player Introduce';
    else if (index === 3) title = 'Crunx Chips Ads';
    else if (index === 4) title = 'Sampai Cahaya Pulang - Indonesian Short Film';
    else if (index === 5) title = 'Si Buta - Trailer';
    else if (index === 6) title = 'World Cup Match Parody';
    else if (index === 7) title = 'Cinematic UGC Videos Montage';
    
    const thumbMap: Record<number, string> = {
      0: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783424880/VIDEO1_aob6jj.mp4',
      1: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423708/video2_z5hzoq.mp4',
      2: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423668/video3_jywxfh.mp4',
      3: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423492/Video4_cfuoyw.mp4',
      4: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783424859/VIDEO5_q6e30f.mp4',
      5: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783424922/VIDEO6_xurmun.mp4',
      6: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423761/Video7_gzwoem.mp4',
      7: 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423787/video8_ai2rr4.mp4',
    };
    const posterMap: Record<number, string> = {
      0: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423422/thumbnail-video1_otssj6.png',
      1: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423411/thumbnailbvideo2_spbzsx.png',
      2: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423412/thumbnailvideo3_lmgt4s.png',
      3: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423415/thumbnailvideo4_fajxoy.png',
      4: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423411/thumbnailvideo5_gddnwe.png',
      5: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423412/thumbnailvideo6_zdfedz.png',
      6: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423424/thumbnailvideo7_ukzdjb.png',
      7: 'https://res.cloudinary.com/vxy1o0uw/image/upload/q_auto,f_auto,w_480/v1783423422/thumbnailvideo8_d5hvor.png',
    };

    return { 
      ...item, 
      title,
      thumbnail: thumbMap[index] ?? 'https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423401/hero-video_voedvc.mp4',
      poster: posterMap[index],
      noAutoPlay: index <= 7,
      forceLetterbox: index === 5
    };
  });

  return (
    <div className="min-h-screen selection:bg-brand-primary selection:text-surface-50 bg-surface-50 pb-20">
      {/* Lightbox */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/98 backdrop-blur-3xl"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`relative flex flex-col items-center transition-all duration-700 ease-[0.16, 1, 0.3, 1] ${
                isExpanded ? 'w-screen h-screen p-0' : 'max-w-7xl w-full max-h-full p-4 md:p-10 gap-8'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`w-full flex items-center justify-center bg-black/20 overflow-hidden transition-all duration-700 ${
                isExpanded ? 'h-full rounded-none' : 'h-full rounded-2xl luxury-shadow'
              }`}>
                <MediaRenderer item={selectedItem} isExpanded={isExpanded} />
              </div>
              
              {!isExpanded && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center text-surface-50 max-w-2xl px-6"
                >
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <span className="text-[10px] font-bold tracking-[0.4em] text-brand-primary uppercase">{selectedItem.category}</span>
                    <span className="text-ink-500 text-[10px] tracking-[0.2em] uppercase">• {selectedItem.type}</span>
                  </div>
                  {selectedItem.title && (
                    <h3 className="text-2xl md:text-5xl font-display font-medium tracking-tight mb-4 italic leading-tight">
                      {selectedItem.title}
                    </h3>
                  )}
                  {selectedItem.tags && selectedItem.tags.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                      {selectedItem.tags.map((tag: string) => (
                        <span key={tag} className="px-3 py-1 bg-surface-50/5 border border-surface-50/10 rounded-full text-[9px] font-bold text-ink-300 uppercase tracking-widest hover:bg-brand-primary/20 hover:text-brand-primary transition-colors cursor-default">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Controls */}
              <div className="fixed top-6 right-6 flex items-center gap-4 z-[110]">
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-12 h-12 rounded-full bg-surface-50/5 border border-surface-50/10 flex items-center justify-center text-surface-50 hover:bg-brand-primary hover:text-ink-900 transition-all backdrop-blur-xl group"
                  title={isExpanded ? "Collapse" : "Expand Fullscreen"}
                >
                  {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="w-12 h-12 rounded-full bg-surface-50/5 border border-surface-50/10 flex items-center justify-center text-surface-50 hover:bg-brand-primary hover:text-ink-900 transition-all backdrop-blur-xl"
                >
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Navbar */}
      <nav className="fixed top-0 left-0 z-50 w-full bg-surface-50/80 backdrop-blur-xl border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="font-display font-bold text-ink-900 tracking-tighter text-3xl md:text-4xl">APIL<span className="text-brand-primary">.</span></span>
          <div className="flex gap-12 text-sm font-bold tracking-[0.3em] uppercase text-ink-400">
            <a
              href="https://mail.google.com/mail/?view=cm&fs=1&to=apilpirman@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 rounded-full bg-ink-900 text-surface-50 text-xs font-bold tracking-[0.2em] uppercase hover:bg-brand-primary hover:text-ink-900 transition-all duration-300"
            >
              Contact
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="about" className="relative pt-28 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="w-full text-center"
          >

            <p className="text-3xl md:text-5xl text-ink-900 max-w-4xl mx-auto font-bold leading-tight tracking-tight mb-6">
              Creating stunning <span className="text-brand-primary italic">AI Videos</span> <span className="font-light text-ink-500">that push the boundaries of cinematic storytelling.</span>
            </p>
            <div className="grid grid-cols-2 max-w-xs md:max-w-md mx-auto mt-8">
              <a href="#capabilities" className="group flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full border border-ink-900 flex items-center justify-center group-hover:bg-brand-primary group-hover:border-brand-primary transition-all duration-500 overflow-hidden relative">
                  <ArrowRight size={20} className="group-hover:text-surface-50 transition-all transform rotate-90" />
                </div>
                <span className="inline-block font-bold tracking-[0.3em] uppercase text-[10px] md:text-xs text-ink-400 group-hover:text-ink-900 transition-colors -mr-[0.3em]">Capabilities</span>
              </a>
              <a href="#work" className="group flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full border border-ink-900 flex items-center justify-center group-hover:bg-brand-primary group-hover:border-brand-primary transition-all duration-500 overflow-hidden relative">
                  <ArrowRight size={20} className="group-hover:text-surface-50 transition-all transform rotate-90" />
                </div>
                <span className="inline-block font-bold tracking-[0.3em] uppercase text-[10px] md:text-xs text-ink-400 group-hover:text-ink-900 transition-colors -mr-[0.3em]">Gallery</span>
              </a>
            </div>
            
            {/* Auto-playing Hero Video */}
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="mt-10 max-w-5xl mx-auto w-full aspect-video rounded-3xl overflow-hidden luxury-shadow border border-surface-200 bg-black relative group"
            >
              <div className="absolute inset-0 bg-ink-900/10 pointer-events-none z-10 group-hover:bg-transparent transition-all duration-700" />
              <video 
                ref={heroVideoRef}
                src="https://res.cloudinary.com/vxy1o0uw/video/upload/q_auto,f_auto/v1783423401/hero-video_voedvc.mp4" 
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-700"
                controls
                autoPlay 
                preload="auto"
                muted 
                loop 
                playsInline 
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => {
                  if (window.scrollY > 100) e.currentTarget.pause();
                }}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="mt-6 max-w-5xl mx-auto flex items-center justify-center gap-8"
            >
              {/* Social Icons */}
              <div className="flex items-center gap-4">
                <a
                  href="https://instagram.com/apilpirman"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-13 h-13 rounded-full border border-ink-900/20 flex items-center justify-center text-ink-700 hover:bg-brand-primary hover:border-brand-primary hover:text-ink-900 transition-all duration-300"
                >
                  <Instagram size={24} />
                </a>
                <a
                  href="https://x.com/apilpirman"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-13 h-13 rounded-full border border-ink-900/20 flex items-center justify-center text-ink-700 hover:bg-brand-primary hover:border-brand-primary hover:text-ink-900 transition-all duration-300"
                >
                  <Twitter size={24} />
                </a>
              </div>

              {/* Divider */}
              <div className="h-10 w-[1px] bg-ink-900/15" />

              {/* Stat */}
              <p className="text-xl md:text-2xl font-bold text-ink-900 leading-snug">
                <span className="text-brand-primary">Million+ Views</span> Generated<br />
                <span className="font-light italic text-ink-500 text-base md:text-lg">from AI-generated videos alone.</span>
              </p>
            </motion.div>

          </motion.div>
        </div>
      </section>

      {/* Skills Section */}
      <section id="capabilities" className="py-20 px-6 bg-ink-900 text-surface-50 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
             <motion.div 
               initial={{ opacity: 0, y: -10 }}
               whileInView={{ opacity: 1, y: 0 }}
               className="flex items-center justify-center gap-3 mb-3"
             >
               <div className="h-[1px] w-8 bg-brand-primary" />
               <span className="inline-block text-brand-primary text-sm font-bold tracking-[0.5em] uppercase -mr-[0.5em]">Capabilities</span>
               <div className="h-[1px] w-8 bg-brand-primary" />
             </motion.div>
             <h2 className="text-4xl md:text-6xl font-display font-medium leading-tight max-w-4xl mx-auto">
               Crafting narratives through <span className="text-brand-primary italic">modern intelligence</span>.
             </h2>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SKILLS.map((skill, index) => (
              <motion.div
                key={skill.name}
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="p-6 border border-surface-50/5 rounded-2xl hover:border-brand-primary/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-surface-50/5 flex items-center justify-center text-brand-primary mb-6 group-hover:bg-brand-primary group-hover:text-ink-900 transition-all">
                  {skill.name === "AI Video Director" ? (
                    <Film size={24} />
                  ) : skill.name.includes("Video") ? (
                    <Film size={24} />
                  ) : skill.name.includes("Copywriter") ? (
                    <PenTool size={24} />
                  ) : skill.name.includes("AI") ? (
                    <Cpu size={24} />
                  ) : (
                    <Sparkles size={24} />
                  )}
                </div>
                <h3 className="text-xl font-display italic font-semibold mb-1">{skill.name}</h3>
                <div className="text-sm font-bold text-brand-primary tracking-widest uppercase mb-4">{skill.level}</div>
                <p className="text-base text-ink-300 font-light leading-relaxed">{skill.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Gallery */}
      <section id="work" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <SectionHeader title="Gallery" subtitle="Portfolio" />


          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col">
                  <div className="aspect-video w-full rounded-xl bg-surface-200 animate-pulse" />
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-20 bg-surface-200 rounded animate-pulse" />
                    <div className="h-4 w-40 bg-surface-200 rounded animate-pulse" />
                  </div>
                </div>
              ))
            ) : filteredItems.length > 0 ? filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                onClick={() => {
                  if (item.category === 'Dev' && item.externalLink) {
                    let url = item.externalLink;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                      url = 'https://' + url;
                    }
                    window.open(url, '_blank', 'noopener,noreferrer');
                  } else if (item.category === 'Video') {
                    setPlayingVideoId(item.id || index);
                  } else {
                    setSelectedItem(item);
                    setIsExpanded(true);
                  }
                }}
                className="cursor-pointer flex flex-col gap-4 bg-surface-50 border border-surface-200 rounded-[1.5rem] p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:border-brand-primary/30 transition-all duration-500 group/card"
              >
                <div className={`group relative overflow-hidden rounded-xl bg-black ${playingVideoId === (item.id || index) ? 'aspect-video ring-2 ring-brand-primary/50' : ''}`}>
                   {index === 5 ? (
                     <div className="relative w-full aspect-video overflow-hidden">
                       <MediaRenderer item={item} isPlayingInline={playingVideoId === (item.id || index)} />
                     </div>
                   ) : (
                     <MediaRenderer item={item} isPlayingInline={playingVideoId === (item.id || index)} />
                   )}
                   {item.category === 'Dev' ? (
                     <div className="absolute inset-0 bg-brand-primary/0 group-hover:bg-brand-primary/80 transition-all duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
                       <div className="flex flex-col items-center gap-4 text-ink-900 scale-150 group-hover:scale-100 transition-all duration-500">
                         <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-xl">
                           <ExternalLink size={24} />
                         </div>
                         <span className="text-[10px] font-black uppercase tracking-[0.3em]">Visit Project</span>
                       </div>
                     </div>
                   ) : item.category !== 'Video' && (
                    <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/40 transition-all duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="w-12 h-12 rounded-full border border-surface-50 scale-150 group-hover:scale-100 transition-all duration-500 flex items-center justify-center text-surface-50">
                        <ArrowRight size={20} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center md:text-left px-2">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-brand-primary uppercase">
                      {item.category === 'Dev' ? 'Dev Project' : item.category}
                    </span>
                  </div>
                  {item.title && item.category !== 'Dev' && (
                    <h4 className="text-lg font-display font-medium text-ink-900 group-hover:italic transition-all">
                      {item.title}
                    </h4>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap justify-center md:justify-start gap-1 mt-2">
                      {item.tags.map((tag: string) => (
                        <span key={tag} className="px-2 py-0.5 bg-surface-200 rounded text-[8px] font-bold text-ink-400 uppercase tracking-tighter">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                {item.title && (
                  <div className="flex items-start gap-3 px-2 pb-2">
                    <div className="w-1 h-4 bg-brand-primary rounded-full mt-0.5 shrink-0" />
                    <h3 className="text-sm font-display font-medium text-ink-900 leading-snug group-hover/card:text-brand-primary transition-colors duration-300">
                      {item.title}
                    </h3>
                  </div>
                )}
              </motion.div>
            )) : (
              <div className="w-full py-20 text-center">
                <p className="text-ink-400 font-display italic text-xl">The gallery is currently being curated...</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-surface-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <span className="font-display font-black text-3xl text-ink-900 tracking-tighter">APIL<span className="text-brand-primary">.</span></span>
            <p className="mt-2 text-sm font-bold tracking-[0.4em] uppercase text-ink-400">Digital Creator</p>
          </div>
          
          <div className="text-sm font-bold text-ink-400 uppercase tracking-[0.5em] text-center md:text-right">
            &copy; 2026 Intention
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}
