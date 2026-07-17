"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { IconMic } from "../../lib/icons";
import BulkQueuePanel from "./BulkQueuePanel";

function SingleProductForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const baseDescriptionRef = useRef("");
  const finalTranscriptRef = useRef("");

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    baseDescriptionRef.current = description ? `${description} ` : "";
    finalTranscriptRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setDescription(baseDescriptionRef.current + finalTranscriptRef.current + interim);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadPhoto(file) {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("submission-images").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("submission-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    try {
      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .insert({ name: name.trim(), text: description.trim() })
        .select()
        .single();
      if (submissionError) throw submissionError;

      if (photoFile) {
        const imageUrl = await uploadPhoto(photoFile);
        const { error: imageError } = await supabase
          .from("submission_images")
          .insert({ submission_id: submission.id, image_url: imageUrl });
        if (imageError) throw imageError;
      }

      setStatus({ type: "success", text: "Added to the queue." });
      setName("");
      setDescription("");
      setPhotoFile(null);
      setPhotoPreview("");
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label className="field-label">Name</label>
        <input
          className="field-input"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="form-field">
        <label className="field-label">Photo (optional)</label>
        <div className="field-file-wrap">
          <label className="field-file-label" htmlFor="single-product-photo">
            {photoFile ? photoFile.name : "Choose File"}
          </label>
          <input id="single-product-photo" className="field-file-input" type="file" accept="image/*" onChange={handlePhotoChange} />
        </div>
        {photoPreview && <img src={photoPreview} alt="Preview" className="photo-preview" />}
      </div>

      <div className="form-field">
        <div className="field-label-row">
          <label className="field-label">Description</label>
          {speechSupported && (
            <button
              type="button"
              className={`mic-btn${listening ? " listening" : ""}`}
              title={listening ? "Stop dictation" : "Dictate description"}
              aria-pressed={listening}
              onClick={toggleDictation}
            >
              <IconMic />
            </button>
          )}
        </div>
        <textarea
          className="field-textarea"
          required
          placeholder="Price, link, why you want it — whatever you know."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <button type="submit" className="btn-save" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      {status && <p className={status.type === "error" ? "modal-error" : "add-status"}>{status.text}</p>}
    </form>
  );
}

export default function AddProductModal({ open, onClose }) {
  const [tab, setTab] = useState("single");
  const router = useRouter();

  if (!open) return null;

  function handleViewQueue() {
    onClose();
    router.push("/bulk-queue");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Add product</h2>

        <div className="modal-tabs">
          <button
            type="button"
            className={`modal-tab${tab === "single" ? " active" : ""}`}
            onClick={() => setTab("single")}
          >
            Single product
          </button>
          <button
            type="button"
            className={`modal-tab${tab === "multi" ? " active" : ""}`}
            onClick={() => setTab("multi")}
          >
            Multiple links
          </button>
        </div>

        {tab === "single" ? <SingleProductForm /> : <BulkQueuePanel compact />}

        <div className="modal-actions modal-actions-split">
          {tab === "multi" ? (
            <button type="button" className="modal-btn tertiary" onClick={handleViewQueue}>
              View Queue
            </button>
          ) : <span />}
          <button type="button" className="modal-btn cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
