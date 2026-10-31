import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { Signup } from "./screens/Signup"
import { Me } from "./screens/Me"
import { BigScreen } from "./screens/BigScreen"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/events" element={<Me initialTab="events" />} />
        <Route path="/me" element={<Me />} />
        <Route path="/screen" element={<BigScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
