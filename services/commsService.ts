import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onDisconnect, set, remove, Database, DatabaseReference } from 'firebase/database'; // Added onChildRemoved
import { SignalMessage, MessageType, UserState, NotePayload } from '../types';

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
    try {
      this.app = initializeApp(firebaseConfig);
      this.db = getDatabase(this.app);
    } catch (e) {
      console.error("Firebase init error:", e);
    }
  }

  public connect(roomId: string, onMessage: (msg: SignalMessage) => void) {
    if (!this.db) return;

    this.roomId = roomId;
    this.onMessageCallback = onMessage;
    
    // References
    this.eventsRef = ref(this.db, `rooms/${roomId}/events`);
    this.usersRef = ref(this.db, `rooms/${roomId}/users`);

    // Listen for new events (notes, effects, joins)
    const startTime = Date.now();

    onChildAdded(this.eventsRef, (snapshot) => {
      const data = snapshot.val() as SignalMessage;
      // For notes, we only want fresh ones to avoid replaying old sounds on join
      if (data.type === 'NOTE_ON' || data.type === 'NOTE_OFF') {
        if (data.timestamp && data.timestamp < startTime) return;
      }
      
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    });

    // Handle Presence (User Joined)
    onChildAdded(this.usersRef, (snapshot) => {
       const rawUser = snapshot.val() as Partial<UserState>;
       
       const user: UserState = {
           id: rawUser.id || 'unknown',
           name: rawUser.name || 'Anonymous',
           colorIndex: rawUser.colorIndex || 0,
           activeNotes: rawUser.activeNotes || [],
           activeEffects: rawUser.activeEffects || []
       };

       if (this.onMessageCallback) {
           this.onMessageCallback({
               type: 'JOIN',
               roomId: this.roomId,
               payload: user,
               senderId: user.id
           });
       }
    });

    // Handle Presence (User Left) - NEW LISTENER
    onChildRemoved(this.usersRef, (snapshot) => {
        const userId = snapshot.key;
        if (userId && this.onMessageCallback) {
            this.onMessageCallback({
                type: 'LEAVE',
                roomId: this.roomId,
                payload: null,
                senderId: userId
            });
        }
    });
  }

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

  public send(type: MessageType, payload: any, senderId: string) {
    if (!this.eventsRef || !this.db) return;

    if (type === 'JOIN') {
        this.localUserId = senderId;
        if (this.usersRef) {
            const userRef = ref(this.db, `rooms/${this.roomId}/users/${senderId}`);
            set(userRef, payload);
            // Remove user on disconnect (Presence system)
            onDisconnect(userRef).remove();
        }
    }

    const msg: SignalMessage = {
        type,
        roomId: this.roomId,
        payload,
        senderId,
        timestamp: Date.now()
    };
    push(this.eventsRef, msg);
  }
}

export const comms = new CommsService();
