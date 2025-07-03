registerPaint('text-mask', class {
    static get inputProperties() { return []; }

    paint(ctx, size) {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 120px Bebas Neue';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STARLING', size.width / 2, size.height / 2);
    }
});
