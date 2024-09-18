document.addEventListener('keydown', function () {

    // const x = chrome.runtime.getURL('assets/sounds/');
    console.log("Hi")
    const audio = new Audio(chrome.runtime.getURL('assets/sounds/typewriter/key-press.wav'));
    audio.play();
});