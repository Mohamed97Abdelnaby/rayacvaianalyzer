import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useToast } from '@/components/ui/use-toast';

interface ChatMessage {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
}

interface ChatAction {
  type: 'enable-ats' | 'open-uploader' | 'focus-criteria' | 'start-evaluation' | 'show-results';
  parameters?: any;
}

interface ChatBotProps {
  onAction?: (action: ChatAction) => void;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  context?: string;
}

const ChatBot = ({ onAction, isOpen: externalIsOpen, onToggle, context }: ChatBotProps = {}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Hello! I\'m here to help you with CV evaluation. I can assist with criteria setup, file uploads, ATS configuration, and more. How can I help you today?',
      isBot: true,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Voice functionality hooks
  const { isRecording, isProcessing, startRecording, stopRecording } = useVoiceRecording();
  const { speak, stop: stopSpeaking, isSpeaking, isLoading: isSpeechLoading } = useTextToSpeech();

  const handleToggle = (newState: boolean) => {
    if (onToggle) {
      onToggle(newState);
    } else {
      setInternalIsOpen(newState);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: { 
          message: text,
          context: context || 'CV evaluation platform - user is interacting with the main interface'
        }
      });

      if (error) throw error;

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply,
        isBot: true,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);

      // Speak the bot response if voice is enabled
      if (voiceEnabled) {
        try {
          await speak(data.reply);
        } catch (error) {
          console.error('Text-to-speech error:', error);
        }
      }

      // Execute actions if any
      if (data.actions && onAction) {
        data.actions.forEach((action: ChatAction) => {
          onAction(action);
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceRecording = async () => {
    if (isRecording) {
      try {
        const transcribedText = await stopRecording();
        if (transcribedText.trim()) {
          await sendMessage(transcribedText);
        }
      } catch (error) {
        console.error('Voice recording error:', error);
        toast({
          title: "Voice Error",
          description: "Failed to process voice message. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      try {
        await startRecording();
      } catch (error) {
        console.error('Failed to start recording:', error);
        toast({
          title: "Microphone Error",
          description: "Could not access microphone. Please check permissions.",
          variant: "destructive",
        });
      }
    }
  };

  const toggleVoice = () => {
    if (isSpeaking) {
      stopSpeaking();
    }
    setVoiceEnabled(!voiceEnabled);
  };

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-80 lg:w-72 xl:w-80 h-96 bg-gradient-secondary border border-border rounded-lg shadow-lg z-40 flex flex-col animate-scale-in">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">CV Assistant</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleVoice}
                className="text-muted-foreground hover:text-foreground"
                title={voiceEnabled ? "Disable voice" : "Enable voice"}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg ${
                      message.isBot
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs opacity-70">
                        {message.timestamp.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </p>
                      {message.isBot && voiceEnabled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => speak(message.text)}
                          disabled={isSpeaking || isSpeechLoading}
                          className="h-6 w-6 p-0 ml-2"
                          title="Replay message"
                        >
                          <Volume2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted text-muted-foreground p-3 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="animate-pulse flex space-x-1">
                        <div className="w-2 h-2 bg-current rounded-full opacity-50"></div>
                        <div className="w-2 h-2 bg-current rounded-full opacity-50"></div>
                        <div className="w-2 h-2 bg-current rounded-full opacity-50"></div>
                      </div>
                      <span className="text-xs">Typing...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          <div className="p-4 border-t border-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(inputValue);
              }}
              className="flex space-x-2"
            >
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={isRecording ? "Recording..." : "Ask me anything..."}
                disabled={isLoading || isRecording || isProcessing}
                className="flex-1"
              />
              <Button 
                type="button"
                onClick={handleVoiceRecording}
                disabled={isLoading || isProcessing}
                variant={isRecording ? "destructive" : "outline"}
                size="sm"
                className={isRecording ? "animate-pulse" : ""}
                title={isRecording ? "Stop recording" : "Start voice message"}
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || !inputValue.trim() || isRecording || isProcessing}
                size="sm"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            {(isSpeaking || isSpeechLoading) && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isSpeechLoading ? "Generating speech..." : "Speaking..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <Button
        onClick={() => handleToggle(!isOpen)}
        className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-50"
        size="icon"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </Button>
    </>
  );
};

export { ChatBot };