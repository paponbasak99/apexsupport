const fs = require('fs');

function generateBoxShadow(n) {
  let value = `${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #FFF`;
  for (let i = 2; i <= n; i++) {
    value += `, ${Math.floor(Math.random() * 2000)}px ${Math.floor(Math.random() * 2000)}px #FFF`;
  }
  return value;
}

const css = `
.bg-container {
  height: 100vh;
  width: 100vw;
  background: radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
  overflow: hidden;
  position: fixed;
  top: 0;
  left: 0;
  z-index: -2;
}

#stars {
  width: 1px;
  height: 1px;
  background: transparent;
  box-shadow: ${generateBoxShadow(700)};
  animation: animStar 50s linear infinite;
}
#stars:after {
  content: " ";
  position: absolute;
  top: 2000px;
  width: 1px;
  height: 1px;
  background: transparent;
  box-shadow: ${generateBoxShadow(700)};
}

#stars2 {
  width: 2px;
  height: 2px;
  background: transparent;
  box-shadow: ${generateBoxShadow(200)};
  animation: animStar 100s linear infinite;
}
#stars2:after {
  content: " ";
  position: absolute;
  top: 2000px;
  width: 2px;
  height: 2px;
  background: transparent;
  box-shadow: ${generateBoxShadow(200)};
}

#stars3 {
  width: 3px;
  height: 3px;
  background: transparent;
  box-shadow: ${generateBoxShadow(100)};
  animation: animStar 150s linear infinite;
}
#stars3:after {
  content: " ";
  position: absolute;
  top: 2000px;
  width: 3px;
  height: 3px;
  background: transparent;
  box-shadow: ${generateBoxShadow(100)};
}

@keyframes animStar {
  from {
    transform: translateY(0px);
  }
  to {
    transform: translateY(-2000px);
  }
}
`;

fs.writeFileSync('./public/css/stars.css', css);
console.log('stars.css generated!');
