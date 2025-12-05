import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, push, onChildAdded, onDisconnect, set, remove, Database, DatabaseReference } from 'firebase/database';
import { SignalMessage, MessageType, UserState, NotePayload } from '../types';

// !!! IMPORTANT: REPLACE THIS WITH YOUR FIREBASE CONFIGURATION !!!
const firebaseConfig = {
  apiKey: "AIzaSyC8cCm5890Za9qZsm1mGqYOuGTShgO3xfo",
  authDomain: "mandaloop-6502e.firebaseapp.com",
  databaseURL: "https://mandaloop-6502e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mandaloop-6502e",
  storageBucket: "mandaloop-6502e.firebasestorage.app",
  messagingSenderId: "264329265376",
  appId: "1:264329265376:web:c8505a7e0ef92d6b031085",
  measurementId: "G-S1YJ5E09XZ"
};

export class CommsService {
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private eventsRef: DatabaseReference | null = null;
  private usersRef: DatabaseReference | null = null;
  private roomId: string = "";
  private localUserId: string = "";
  private onMessageCallback: ((msg: SignalMessage) => void) | null = null;

  constructor() {
    // Basic check to see if user has configured Firebase
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.warn("Mandaloop: Firebase config is missing. Multiplayer will not function until `services/commsService.ts` is updated.");
    } else {
      try {
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase(this.app);
      } catch (e) {
        console.error("Firebase init error:", e);
      }
    }
  }

  public connect(roomId: string, onMessage: (msg: SignalMessage) => void) {
    if (!this.db) return;

    this.roomId = roomId;
    this.onMessageCallback = onMessage;
    
    // References
    const roomRef = ref(this.db, `rooms/${roomId}`);
    this.eventsRef = ref(this.db, `rooms/${roomId}/events`);
    this.usersRef = ref(this.db, `rooms/${roomId}/users`);

    // Listen for new events (notes, effects, joins)
    // We limit to the last 1 initially to avoid replaying the entire history, 
    // but effectively we just want "new" children. 
    // 'limitToLast(1)' combined with 'onChildAdded' often misses events if we aren't careful, 
    // so for a jam session, listening to the stream from 'now' is ideal.
    // For simplicity in this implementation, we just listen to child_added.
    // In a production app, we might want to filter by timestamp > connectionTime.
    const startTime = Date.now();

    onChildAdded(this.eventsRef, (snapshot) => {
      const data = snapshot.val() as SignalMessage;
      // Filter out stale events from before we joined if desired, 
      // though replaying the 'current state' (like active themes) might be wanted.
      // For notes, we only want fresh ones.
      if (data.type === 'NOTE_ON' || data.type === 'NOTE_OFF') {
        if (data.timestamp && data.timestamp < startTime) return;
      }
      
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    });

    // Handle Presence (Users List)
    onChildAdded(this.usersRef, (snapshot) => {
       const user = snapshot.val() as UserState;
       // We can treat a new user entry as a JOIN event for the local state
       if (this.onMessageCallback) {
           this.onMessageCallback({
               type: 'JOIN',
               roomId: this.roomId,
               payload: user,
               senderId: user.id
           });
       }
    });
  }

  // --- Specific method for sending notes as requested ---
  public sendNote(notePayload: NotePayload, userId: string) {
    if (!this.eventsRef) return;
    
    const msg: SignalMessage = {
        type: 'NOTE_ON',
        roomId: this.roomId,
        senderId: userId,
        payload: notePayload,
        timestamp: Date.now()
    };

    push(this.eventsRef, msg);
  }

  public sendNoteOff(noteIndex: number, userId: string) {
      if (!this.eventsRef) return;
      
      const msg: SignalMessage = {
          type: 'NOTE_OFF',
          roomId: this.roomId,
          senderId: userId,
          payload: { noteIndex },
          timestamp: Date.now()
      };
  
      push(this.eventsRef, msg);
  }

  // --- Generic send for effects, themes, etc ---
  public send(type: MessageType, payload: any, senderId: string) {
    if (!this.eventsRef) return;

    // If it's a JOIN event, we also want to persist the user in the 'users' node
    // to handle the user list properly.
    if (type === 'JOIN') {
        this.localUserId = senderId;
        if (this.usersRef) {
            const userRef = ref(this.db, `rooms/${this.roomId}/users/${senderId}`);
            set(userRef, payload);
            // Remove user on disconnect
            onDisconnect(userRef).remove();
        }
    }

    // Push the event to the stream
    const msg: SignalMessage = {
        type,
        roomId: this.roomId,
        payload,
        senderId,
        timestamp: Date.now()
    };
    push(this.eventsRef, msg);
  }

  public close() {
    // Firebase connection persists, but we could remove listeners here if needed.
    // For now, we rely on page unload or new connection to reset.
  }
}

export const comms = new CommsService();
