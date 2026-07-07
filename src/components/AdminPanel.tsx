import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import { Plus, Trash2, Edit2, LogOut, LogIn, Save, X, Image as ImageIcon, Video, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PortfolioItem {
  id: string;
  docId?: string;
  type: 'AI' | 'Non-AI';
  title: string;
  category: 'Image' | 'Video' | 'Dev';
  thumbnail: string;
  externalLink?: string;
  tags?: string[];
  createdAt: string;
}

const MediaRenderer = ({ item }: { item: any }) => {
  let displayUrl = item.thumbnail || "";
  if (!displayUrl) return (
    <div className="aspect-video w-full flex items-center justify-center bg-surface-100 text-ink-300 text-[10px] font-bold uppercase tracking-widest">
      No Media Provided
    </div>
  );

  // Handle Google Drive Links
  const gdriveMatch = displayUrl.match(/drive\.google\.com\/file\/d\/([^\/\?]+)/) || displayUrl.match(/id=([^\/\?&]+)/);
  const fileId = gdriveMatch ? gdriveMatch[1] : null;

  // Smarter video detection for preview and live sync
  const isYoutube = displayUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/);
  const isVimeo = displayUrl.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(.+)/);
  const isDirectVideo = displayUrl.match(/\.(mp4|webm|ogg|mov)$|^data:video/i);
  const isVideo = item.category === 'Video' || !!isYoutube || !!isVimeo || !!isDirectVideo;

  if (fileId && isVideo) {
    return (
      <div className="aspect-video w-full">
        <iframe
          src={`https://drive.google.com/file/d/${fileId}/preview`}
          className="w-full h-full border-0"
          allow="autoplay"
        ></iframe>
      </div>
    );
  }

  if (fileId) {
    displayUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  if (isVideo) {
    if (isYoutube) {
      const videoId = isYoutube[1].split('&')[0];
      return (
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          ></iframe>
        </div>
      );
    }
    
    if (isVimeo) {
      const videoId = isVimeo[1];
      return (
        <div className="aspect-video w-full">
          <iframe
            src={`https://player.vimeo.com/video/${videoId}`}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen; picture-in-picture"
          ></iframe>
        </div>
      );
    }

    return (
      <video 
        src={displayUrl} 
        className="w-full h-auto max-h-[700px] object-contain bg-black"
        muted
        loop
        playsInline
        controls={!!displayUrl}
      />
    );
  }

  return (
    <img 
      src={displayUrl} 
      alt={item.title}
      className="w-full h-auto transition-transform duration-1000"
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.src = "https://placehold.co/600x400/f8fafc/94a3b8?text=Invalid+Media+URL";
      }}
    />
  );
};

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<'Image' | 'Video' | 'Dev'>('Image');
  const [isAdding, setIsAdding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number, total: number} | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<PortfolioItem>>({
    type: 'AI',
    category: 'Image',
    tags: []
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) fetchItems();
    });
    return () => unsubscribe();
  }, []);

  const fetchItems = async () => {
    try {
      const q = query(collection(db, 'portfolio'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ 
        ...doc.data(), 
        docId: doc.id 
      })) as PortfolioItem[];
      setItems(data);
    } catch (error) {
      console.error("Error fetching items:", error);
    }
  };

  const filteredItems = items.filter(item => item.category === activeCategory);

  const compressImage = (base64: string, quality = 0.6, maxWidth = 1200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadProgress({ current: 0, total: files.length });
    setIsAnalyzing(true);
    const batchType = 'AI'; 
    const currentCategory = activeCategory;

    try {
      if (files.length === 1) {
        const file = files[0];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        if (base64.length > 1048000) {
          alert("File exceeds 1MB limit. Please use a compressed image or link.");
          return;
        }

        const isVideoFile = file.type.startsWith('video/');

        setNewItem(prev => ({
          ...prev,
          thumbnail: base64,
          title: prev.category === 'Dev' ? "" : (prev.title || file.name.split('.')[0].replace(/[-_]/g, ' ')),
          category: prev.category === 'Dev' ? 'Dev' : (isVideoFile ? 'Video' : 'Image')
        }));
        return;
      }

      for (let i = 0; i < files.length; i++) {
         const file = files[i];
         setUploadProgress({ current: i + 1, total: files.length });
         
         try {
           let base64 = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.onloadend = () => resolve(reader.result as string);
             reader.onerror = reject;
             reader.readAsDataURL(file);
           });

           const isVideoFile = file.type.startsWith('video/');
           
           if (!isVideoFile) {
             base64 = await compressImage(base64);
           }

            if (base64.length > 1048000) {
              console.warn(`File ${file.name} exceeds Firestore 1MB limit. Recommended: Use YouTube/Vimeo link for large videos.`);
              continue;
            }

           const title = currentCategory === 'Dev' ? "" : file.name.split('.')[0].replace(/[-_]/g, ' '); 
           
           const itemToSave = {
             id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
             type: batchType,
             category: currentCategory === 'Dev' ? 'Dev' : (isVideoFile ? 'Video' : 'Image'),
             title: title,
             thumbnail: base64,
             externalLink: newItem.externalLink || "",
             tags: newItem.tags || [],
             createdAt: new Date().toISOString()
           };

           await addDoc(collection(db, 'portfolio'), itemToSave);
         } catch (err) {
           console.error(`Failed to process ${file.name}:`, err);
         }
      }
    } catch (globalErr) {
      console.error("Batch upload failed:", globalErr);
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
        setIsAnalyzing(false);
        setIsAdding(false);
        fetchItems();
      }, 1500);
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleCreate = async () => {
    if (!newItem.title || !newItem.thumbnail) return;
    try {
      const itemToSave = {
        ...newItem,
        id: `item-${Date.now()}`,
        createdAt: new Date().toISOString(),
        tags: newItem.tags || []
      };
      await addDoc(collection(db, 'portfolio'), itemToSave);
      setNewItem({ type: 'AI', category: 'Image', tags: [] });
      setIsAdding(false);
      fetchItems();
    } catch (error: any) {
      console.error("Save failure:", error);
      alert(`Upload Failed: ${error.message || "Insufficient Permissions"}. Please ensure you are logged in as apilpirman@gmail.com and the file is under 1MB.`);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, 'portfolio', deletingId));
      setDeletingId(null);
      fetchItems();
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 font-display italic text-ink-400">
      Initializing Workspace...
    </div>
  );

  if (!user || user.email !== "apilpirman@gmail.com") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 px-6">
        <div className="max-w-md w-full text-center space-y-10">
          <div className="space-y-4">
            <h1 className="text-6xl font-display font-bold text-ink-900 tracking-tighter">
              Vault<span className="text-brand-primary">.</span>
            </h1>
            <p className="text-sm font-bold tracking-[0.4em] uppercase text-ink-400">Restricted Workspace</p>
          </div>
          
          <button 
            onClick={login}
            className="group flex flex-col items-center gap-4 mx-auto"
          >
            <div className="w-20 h-20 rounded-full border border-ink-900 flex items-center justify-center group-hover:bg-brand-primary group-hover:border-brand-primary transition-all duration-500 overflow-hidden relative">
              <LogIn size={24} className="group-hover:text-surface-50 transition-all" />
            </div>
            <span className="font-bold tracking-[0.3em] uppercase text-xs text-ink-400 group-hover:text-ink-900 transition-colors">
              Authorize Access
            </span>
          </button>
          
          {user && (
            <p className="text-xs text-red-500 mt-4 font-medium italic">
              Access denied for {user.email}. Please use the master account.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-40">
      {/* Admin Navbar */}
      <nav className="fixed top-0 left-0 z-50 w-full bg-surface-50/80 backdrop-blur-xl border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-display font-bold text-ink-900 tracking-tighter text-2xl">
              APIL<span className="text-brand-primary">.</span>MGMT
            </span>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden md:block text-[10px] font-bold tracking-[0.3em] uppercase text-brand-primary">
              System Active
            </span>
            <button 
              onClick={() => signOut(auth)}
              className="group flex items-center gap-3 text-xs font-bold tracking-widest uppercase text-ink-400 hover:text-ink-900 transition-colors"
            >
              Logout
              <LogOut size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content (Mirrors Home Style) */}
      <section className="pt-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="h-[1px] w-8 bg-brand-primary"></div>
              <span className="text-sm font-bold tracking-[0.4em] text-brand-primary uppercase">Curation Mode</span>
              <div className="h-[1px] w-8 bg-brand-primary"></div>
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-medium text-ink-900 tracking-tight leading-none text-center">
              Manage Collection
            </h2>
          </div>

          {/* Admin Category Tabs */}
          <div className="flex justify-center mb-16 px-6">
            <div className="flex p-1 bg-surface-100 rounded-2xl border border-surface-200">
              {(['Image', 'Video', 'Dev'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${
                    activeCategory === cat
                      ? 'bg-white text-brand-primary shadow-sm ring-1 ring-black/5'
                      : 'text-ink-300 hover:text-ink-600'
                  }`}
                >
                  {cat === 'Dev' ? 'Project Dev' : cat + 's'}
                </button>
              ))}
            </div>
          </div>

          <div className="columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
            {/* Add New Trigger Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="break-inside-avoid"
            >
              <button 
                onClick={() => {
                  setNewItem({ ...newItem, category: activeCategory });
                  setIsAdding(true);
                }}
                className="w-full aspect-[16/10] rounded-xl border-2 border-dashed border-surface-200 flex flex-col items-center justify-center gap-4 hover:border-brand-primary group transition-all bg-white/50"
              >
                <div className="w-14 h-14 rounded-full bg-surface-50 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-surface-50 transition-all font-light">
                  <Plus size={24} />
                </div>
                <span className="text-xs font-bold tracking-widest uppercase text-ink-400 group-hover:text-ink-900 transition-colors">
                  Add New Work
                </span>
              </button>
            </motion.div>

            {/* Gallery Items with Management Overlays */}
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.docId}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="break-inside-avoid"
              >
                <div className="group relative overflow-hidden rounded-xl bg-surface-200 luxury-shadow">
                  <MediaRenderer item={item} />
                  
                  {/* Admin Controls Overlay */}
                  <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/60 transition-all duration-500 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-4">
                    <button 
                      onClick={() => setDeletingId(item.docId!)}
                      className="w-12 h-12 rounded-full border border-surface-50/20 hover:bg-red-500 hover:border-red-500 transition-all flex items-center justify-center text-surface-50"
                    >
                      <Trash2 size={18} />
                    </button>
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-surface-50/50">
                      ID: {item.docId?.slice(-6)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 px-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-brand-primary uppercase">
                      {item.category}
                    </span>
                  </div>
                  {item.title && item.category !== 'Dev' && (
                    <h4 className="text-lg font-display font-medium text-ink-900 group-hover:italic transition-all">
                      {item.title}
                    </h4>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags?.map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-surface-100 rounded text-[8px] font-bold text-ink-400 uppercase tracking-tighter">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Add Item Modal */}
      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          >
            <div 
              className="absolute inset-0 bg-ink-900/90 backdrop-blur-sm" 
              onClick={() => !isAnalyzing && setIsAdding(false)} 
            />
            
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface-50 w-full max-w-2xl rounded-3xl overflow-hidden relative luxury-shadow"
            >
              <div className="p-8 md:p-12">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-3xl font-display font-medium text-ink-900">New Addition</h2>
                  <button 
                    onClick={() => !isAnalyzing && setIsAdding(false)} 
                    disabled={isAnalyzing}
                    className="text-ink-400 hover:text-ink-900 transition-colors disabled:opacity-20"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold tracking-widest uppercase text-ink-400 flex items-center justify-between">
                          Title
                        </label>
                        <input 
                          type="text" 
                          placeholder="e.g., Ethereal Morning"
                          value={newItem.title || ''}
                          className="w-full bg-white border border-surface-200 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-primary transition-all text-ink-900"
                          onChange={e => setNewItem({...newItem, title: e.target.value})}
                        />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-bold tracking-widest uppercase text-ink-400">
                          {newItem.category === 'Dev' ? 'Project Thumbnail' : 'Media Content'}
                        </label>
                        
                        <div className="flex flex-col gap-4">
                          <button
                            onClick={() => document.getElementById('local-upload')?.click()}
                            disabled={isAnalyzing}
                            className="group relative flex items-center justify-center gap-3 w-full h-32 rounded-2xl border-2 border-dashed border-surface-200 hover:border-brand-primary hover:bg-brand-primary/5 transition-all text-ink-400 overflow-hidden disabled:opacity-50"
                          >
                            {uploadProgress ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-50 text-ink-900 px-6 z-10">
                                <div className="w-full bg-surface-200 h-1 rounded-full mb-3 overflow-hidden">
                                  <motion.div 
                                    className="h-full bg-brand-primary"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold tracking-widest uppercase">
                                  {uploadProgress.current === uploadProgress.total && !isAnalyzing ? 'Batch Processed' : `Uploading ${uploadProgress.current} / ${uploadProgress.total}`}
                                </span>
                                {uploadProgress.current === uploadProgress.total && !isAnalyzing && (
                                  <motion.div 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-2 text-[10px] text-green-600 font-bold uppercase tracking-widest"
                                  >
                                    All works added successfully
                                  </motion.div>
                                )}
                              </div>
                            ) : newItem.thumbnail ? (
                              <div className="absolute inset-0">
                                {newItem.category === 'Video' ? (
                                  <video src={newItem.thumbnail} className="w-full h-full object-cover opacity-50" />
                                ) : (
                                  <img src={newItem.thumbnail} className="w-full h-full object-cover opacity-50" />
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-ink-900/40">
                                  <Upload size={20} className="text-white" />
                                </div>
                              </div>
                            ) : (
                              <>
                                <Upload size={20} className="group-hover:text-brand-primary transition-colors" />
                                <div className="flex flex-col items-center">
                                  <span className="text-xs font-bold uppercase tracking-widest group-hover:text-ink-900 transition-colors">
                                    {newItem.category === 'Dev' ? 'Upload Project Cover' : 'Batch Upload Media'}
                                  </span>
                                </div>
                              </>
                            )}
                          </button>
                          <input 
                            id="local-upload"
                            type="file" 
                            multiple
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={handleBatchUpload}
                          />
                          
                          <div className="space-y-4">
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                                <span className="text-[10px] font-bold uppercase text-ink-300">URL</span>
                              </div>
                              <input 
                                type="text" 
                                placeholder={newItem.category === 'Dev' ? "Project cover image URL..." : "YouTube, Vimeo, Google Drive, or Direct URL..."}
                                value={newItem.thumbnail || ''}
                                className="w-full bg-white border border-surface-200 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-brand-primary transition-all text-xs text-ink-900"
                                onChange={e => setNewItem({...newItem, thumbnail: e.target.value})}
                              />
                            </div>
                            
                            {newItem.thumbnail && (
                              <div className="rounded-xl overflow-hidden border border-surface-200 bg-surface-50 p-2">
                                <p className="text-[8px] font-bold text-ink-400 uppercase tracking-tight mb-2 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                                  Live Preview
                                </p>
                                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black flex items-center justify-center">
                                  <MediaRenderer item={newItem as any} />
                                </div>
                              </div>
                            )}

                            <p className="text-[10px] text-ink-400 font-medium italic px-2">
                              * Direct uploads are limited to 1MB. Use YouTube, Vimeo, or Google Drive for larger media.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold tracking-widest uppercase text-ink-400">Media Format</label>
                          <select 
                            className="w-full bg-white border border-surface-200 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-primary transition-all text-ink-900 appearance-none"
                            value={newItem.category}
                            onChange={e => setNewItem({...newItem, category: e.target.value as any})}
                          >
                            <option value="Image">Still Image</option>
                            <option value="Video">Moving Media</option>
                            <option value="Dev">Dev Project</option>
                          </select>
                        </div>
                      </div>

                      {newItem.category === 'Dev' && (
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold tracking-widest uppercase text-ink-400">Project Link (External)</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                              <span className="text-[10px] font-bold uppercase text-ink-300">LINK</span>
                            </div>
                            <input 
                              type="text" 
                              placeholder="Deployment or repo URL..."
                              value={(newItem as PortfolioItem).externalLink || ''}
                              className="w-full bg-white border border-surface-200 rounded-xl pl-14 pr-4 py-3 focus:outline-none focus:border-brand-primary transition-all text-xs text-ink-900"
                              onChange={e => setNewItem({...newItem, externalLink: e.target.value})}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="space-y-4">
                        <label className="text-[10px] font-bold tracking-widest uppercase text-ink-400">Tags (comma separated)</label>
                        <input 
                          type="text" 
                          placeholder="e.g., Portrait, Cinematic, Glow"
                          value={newItem.tags?.join(', ') || ''}
                          className="w-full bg-white border border-surface-200 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-primary transition-all text-ink-900 text-xs"
                          onChange={e => setNewItem({...newItem, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)})}
                        />
                      </div>
                      
                      <div className="pt-6">
                        <button 
                          onClick={handleCreate}
                          disabled={isAnalyzing || !newItem.title || !newItem.thumbnail}
                          className="w-full h-[54px] bg-ink-900 text-surface-50 rounded-xl font-bold hover:bg-brand-primary hover:text-ink-900 transition-all uppercase tracking-widest text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {uploadProgress ? 'Batch in Progress...' : 'Archive to Gallery'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deletion Confirmation Modal */}
      <AnimatePresence>
        {deletingId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center px-6"
          >
            <div className="absolute inset-0 bg-ink-900/95 backdrop-blur-md" onClick={() => setDeletingId(null)} />
            <motion.div 
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface-50 p-8 rounded-3xl max-w-sm w-full relative luxury-shadow text-center"
            >
              <h3 className="text-2xl font-display font-medium text-ink-900 mb-2">Remove Artwork?</h3>
              <p className="text-sm text-ink-400 mb-8 leading-relaxed">This action is permanent and will remove the piece from all public galleries.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-4 bg-surface-200 text-ink-900 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-surface-300 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-red-600 text-surface-50 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-red-700 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

