/**
 * @author Austin Jenchi
 * CSE 154 AQ 19sp
 */
(function() {
    "use strict";
    const WIDTH = 10;

    // const because it shouldn't be overwriten (final), not upper because it's not constant
    const undoStack = [];

    window.addEventListener("load", init);

    /**
     * Run once the page loads.
     */
    function init() {
        /* remove the page-rendering id so that the css knows that the page is done loading
        this makes the animation wait till the page is loaded */
        document.body.dataset.pageLoad = "";

        const canvas = document.getElementsByTagName("canvas")[0];
        // per MDN, canvas context size must be set using the html properties width and height
        const computedCanvas = window.getComputedStyle(canvas);
        canvas.width = computedCanvas.width.substring(0, computedCanvas.width.length - 2);
        canvas.height = computedCanvas.height.substring(0, computedCanvas.height.length - 2);
        const ctx = canvas.getContext("2d");
        ctx.lineWidth = WIDTH;
        const redoStack = [];
        let curState = null;
        let isMouseDown = false;
        canvas.addEventListener("mousedown", () => {
            undoStack.push({ command: curState, color: "#000000", pos: [] });
            isMouseDown = true;
        });
        canvas.addEventListener("mousemove", () => {
            if (isMouseDown) {
                undoStack[undoStack.length - 1].pos.push(getMousePos(canvas, event));
            }
        });
        canvas.addEventListener("mouseup", () => {
            isMouseDown = false;
        });

        document.getElementById("button-row").childNodes.forEach((node) => {
            if (node.nodeName === "BUTTON" && node.dataset.stateChange !== "no") {
                const stateName = node.id.substring(4);   // btn- is 4 chars.
                node.addEventListener("click", () => {
                    curState = stateName;
                });
            }
        });

        document.getElementById("btn-undo").addEventListener("click", () => {
            let stroke = undoStack.pop();
            redoStack.push(stroke);
        });

        document.getElementById("btn-redo").addEventListener("click", () => {
            let stroke = redoStack.pop();
            undoStack.push(stroke);
        });

        document.getElementById("btn-fill").addEventListener("click", clear);   // todo: add color

        document.getElementById("btn-clear").addEventListener("click", clear);

        clear();
        setInterval(() => {
            render(ctx);
        }, 10);
    }

    /**
     * 
     */
    function render(ctx) {
        for (let stroke of undoStack) {
            if (stroke.command === "paint") {
                ctx.strokeStyle = stroke.color;
                ctx.beginPath();
                for (let pos of stroke.pos) {
                    ctx.lineTo(pos.x, pos.y);
                }
                ctx.stroke();
            } else if (stroke.command === "fill") {
                ctx.fillStyle = stroke.color;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            }
        }
    }

    /**
     * 
     */
    function clear() {
        undoStack.push({ command: "fill", color: "#ffffff" });
    }

    /**
     * 
     * @param {*} mouseEvent 
     */
    function getMousePos(canvas, mouseEvent) {
        const canvasOffest = { x: canvas.offsetLeft, y: canvas.offsetTop };
        return {
            x: mouseEvent.clientX - canvasOffest.x - 10,
            y: mouseEvent.clientY - canvasOffest.y - 10
        };
    }
})();
