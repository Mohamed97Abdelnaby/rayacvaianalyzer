import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string, voice: string = 'alloy') => {
    if (!text.trim()) return;

    try {
      setIsLoading(true);
      
      // Send to Supabase edge function
      const { data, error } = await supabase.functions.invoke('text-to-voice', {
        body: { text, voice }
      });

      if (error) throw error;

      // Create audio element and play
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audioRef.current = audio;

      audio.onloadstart = () => setIsLoading(false);
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => {
        setIsSpeaking(false);
        setIsLoading(false);
        console.error('Audio playback error');
      };

      await audio.play();
    } catch (error) {
      console.error('Text to speech error:', error);
      setIsLoading(false);
      setIsSpeaking(false);
      throw error;
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading
  };
};