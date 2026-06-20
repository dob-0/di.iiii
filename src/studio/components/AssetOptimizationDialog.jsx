import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Stack,
    Typography
} from '@mui/material'
import { formatAssetSize } from '../utils/assetOptimization.js'

export default function AssetOptimizationDialog({
    prompt,
    onOptimize,
    onUploadOriginal,
    onCancel
}) {
    const file = prompt?.file
    const status = prompt?.status || 'choice'
    const isOptimizing = status === 'optimizing'
    const hasError = status === 'error'

    return (
        <Dialog
            open={Boolean(file)}
            onClose={isOptimizing ? undefined : onCancel}
            fullWidth
            maxWidth="sm"
            aria-labelledby="asset-optimization-title"
        >
            <DialogTitle id="asset-optimization-title">Large model detected</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="body2">
                        <strong>{file?.name}</strong> is {formatAssetSize(file?.size)}. Large models
                        can make the scene slow to open.
                    </Typography>
                    {isOptimizing ? (
                        <>
                            <Typography variant="body2" color="text.secondary">
                                Optimizing textures and model data before upload…
                            </Typography>
                            <LinearProgress aria-label="Optimizing model" />
                        </>
                    ) : (
                        <Typography variant="body2" color={hasError ? 'error' : 'text.secondary'}>
                            {hasError
                                ? prompt.error
                                : 'Recommended: resize embedded textures to 2048px, convert them to WebP, and clean up model data. Geometry is not simplified.'}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            {!isOptimizing ? (
                <DialogActions>
                    <Button onClick={onCancel}>Cancel</Button>
                    <Button onClick={onUploadOriginal}>Upload original</Button>
                    {!hasError ? (
                        <Button variant="contained" onClick={onOptimize}>
                            Optimize &amp; upload
                        </Button>
                    ) : null}
                </DialogActions>
            ) : null}
        </Dialog>
    )
}
