import "./style.css";

// import { firebase } from "firebase/app";
// import "firebase/firestore";

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";

import { firebaseConfig } from "./firebase-config";

// if (!firebase.apps.length) {
//   firebase.initializeApp(firebaseConfig);
// }
const app = initializeApp(firebaseConfig);

// const firestore = firebase.firestore();
const firestore = getFirestore(app);
console.log(firestore);

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  // const callDoc = firestore.collection("calls").doc();
  const callDoc = await addDoc(collection(firestore, "calls"), {});

  // const offerCandidates = callDoc.collection("offerCandidates");
  // const answerCandidates = callDoc.collection("answerCandidates");
  const offerCandidates = collection(
    firestore,
    callDoc.path,
    "offerCandidates"
  );
  const answerCandidates = collection(
    firestore,
    callDoc.path,
    "answerCandidates"
  );

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    // event.candidate && offerCandidates.add(event.candidate.toJSON());
    event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // await callDoc.set({ offer });
  // await addDoc(offerCandidates, { offer });
  await updateDoc(callDoc, { offer });

  // Listen for remote answer
  onSnapshot(callDoc, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  // const callDoc = firestore.collection("calls").doc(callId);
  // const answerCandidates = callDoc.collection("answerCandidates");
  // const offerCandidates = callDoc.collection("offerCandidates");
  const callDoc = doc(firestore, "calls", callId);
  const answerCandidates = collection(callDoc, "answerCandidates");
  const offerCandidates = collection(callDoc, "offerCandidates");

  pc.onicecandidate = (event) => {
    console.log("onicecandidate");
    // event.candidate && answerCandidates.add(event.candidate.toJSON());
    event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
  };

  // console.log(callDoc);
  // const callData = (await callDoc.get()).data();
  const callData = (await getDoc(callDoc)).data();
  console.log(callData);

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // await callDoc.update({ answer });
  await updateDoc(callDoc, { answer });

  onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === "added") {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};
