"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { trackOfferAddedToMyList, trackOfferRemovedFromMyList } from '@/src/lib/events';

interface MyListContextType {
  myList: string[];
  addToMyList: (ofertaId: string) => void;
  removeFromMyList: (ofertaId: string) => void;
  isInMyList: (ofertaId: string) => boolean;
  clearMyList: () => void;
}

const MyListContext = createContext<MyListContextType | undefined>(undefined);

const MY_LIST_KEY = 'buscoedu_mi_lista';

export function MyListProvider({ children }: { children: ReactNode }) {
  const [myList, setMyList] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargar lista desde localStorage al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MY_LIST_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMyList(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          console.error('Error parsing my list from localStorage:', error);
          setMyList([]);
        }
      }
      setIsLoaded(true);
    }
  }, []);

  // Guardar en localStorage cuando cambia la lista
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      localStorage.setItem(MY_LIST_KEY, JSON.stringify(myList));
    }
  }, [myList, isLoaded]);

  const addToMyList = (ofertaId: string) => {
    setMyList(prev => {
      if (prev.includes(ofertaId)) return prev;
      // Registrar evento de adición
      trackOfferAddedToMyList(ofertaId);
      return [...prev, ofertaId];
    });
  };

  const removeFromMyList = (ofertaId: string) => {
    setMyList(prev => {
      const filtered = prev.filter(id => id !== ofertaId);
      // Solo registrar si realmente se eliminó
      if (filtered.length < prev.length) {
        trackOfferRemovedFromMyList(ofertaId);
      }
      return filtered;
    });
  };

  const isInMyList = (ofertaId: string) => {
    return myList.includes(ofertaId);
  };

  const clearMyList = () => {
    setMyList([]);
  };

  return (
    <MyListContext.Provider value={{ myList, addToMyList, removeFromMyList, isInMyList, clearMyList }}>
      {children}
    </MyListContext.Provider>
  );
}

export function useMyList() {
  const context = useContext(MyListContext);
  if (context === undefined) {
    throw new Error('useMyList must be used within a MyListProvider');
  }
  return context;
}
