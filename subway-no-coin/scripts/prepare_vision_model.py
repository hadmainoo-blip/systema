"""Prepare the pinned Apache-2.0 MobileNet backbone; requires onnx==1.18.0.

The source model is downloaded separately from the pinned revision in models/README.md.
"""
import argparse
import hashlib
import pathlib
import onnx
from onnx import helper,TensorProto

parser=argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('--output',default='extension/models/vision.onnx')
args=parser.parse_args()
source=pathlib.Path(args.source)
expected='6e575dbe274417c0be6c0c851b6fd012732d924c3f63a6dfe70f602144783ec8'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected:raise SystemExit('Pinned source model checksum mismatch')
model=onnx.load(source)
last=next(n for n in model.graph.node if n.op_type=='GlobalAveragePool' and n.name.startswith('/global_pool/'))
output=last.input[0]
required={output};nodes=[]
for node in reversed(model.graph.node):
    if any(name in required for name in node.output):
        nodes.append(node);required.update(node.input)
nodes.reverse()
initializers=[x for x in model.graph.initializer if x.name in required]
del model.graph.node[:];model.graph.node.extend(nodes)
del model.graph.initializer[:];model.graph.initializer.extend(initializers)
del model.graph.output[:];model.graph.output.append(helper.make_tensor_value_info(output,TensorProto.FLOAT,[1,576,7,7]))
for dimension,value in zip(model.graph.input[0].type.tensor_type.shape.dim,[1,3,224,224]):dimension.ClearField('dim_param');dimension.dim_value=value
del model.graph.value_info[:]
onnx.checker.check_model(model)
target=pathlib.Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);onnx.save(model,target)
print('Prepared vision backbone:',target.stat().st_size,'bytes; SHA256',hashlib.sha256(target.read_bytes()).hexdigest())
