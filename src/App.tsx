import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <div className="flex gap-8 mb-8">
        <a href="https://vite.dev" target="_blank" className="transition-transform hover:scale-110">
          <img src={viteLogo} className="h-24 w-24" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" className="transition-transform hover:scale-110">
          <img src={reactLogo} className="h-24 w-24 animate-spin-slow" alt="React logo" />
        </a>
      </div>
      
      <h1 className="text-4xl font-bold text-white mb-8">Vite + React + Tailwind</h1>
      
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center">
        <button 
          onClick={() => setCount((count) => count + 1)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition-colors mb-4"
        >
          count is {count}
        </button>
        <p className="text-gray-600">
          Edit <code className="bg-gray-100 px-2 py-1 rounded text-sm">src/App.tsx</code> and save to test HMR
        </p>
      </div>
      
      <p className="text-gray-400 mt-8 text-center max-w-md">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
