window.Helper = (html, css) => {
    let body = document.body
    let container = document.createElement('div')
    container.id = 'container'
    container.innerHTML = `<style>${css}</style><div id="flex">${html}</div><div id="simulate-flex">${html}</div>`
    body.appendChild(container)
}
