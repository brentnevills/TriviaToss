import urllib.request
import json
import re

courses = [
    "SNC1W", "SNC2D", "SNC2P", "SBI3U", "SBI3C", "SCH3U", "SPH3U", "SVN3M", "SVN3E", "SBI4U", "SCH4U", "SCH4C", "SPH4U", "SPH4C", "SNC4M", "SNC4E",
    "ENG1D", "ENG1P", "ENG2D", "ENG2P", "ENG3U", "ENG3C", "ENG3E", "ENG4U", "ENG4C", "ENG4E", "OLC4O",
    "MTH1W", "MPM2D", "MFM2P", "MAT2L", "MCR3U", "MCF3M", "MBF3C", "MEL3E", "MHF4U", "MCV4U", "MDM4U", "MAP4C", "MCT4C", "MEL4E",
    "CGC1D", "CGC1P", "CHC2D", "CHC2P", "CHV2O", "CGG3O", "CHT3O", "CHW3M", "CLU3M", "CGW4U", "CHI4U", "CHY4U", "CIA4U", "CLN4U", "CPW4U",
    "HIF10", "HIF2O", "HIP4O", "HSP3U", "HSP3C", "HSG3M", "HPC3O", "HPW3C", "HSB4U", "HHS4U", "HHS4C", "HIP4O", "HPD4C",
    "FSF1D", "FSF1P", "FSF1O", "FSF2D", "FSF2P", "FSF3U", "FSF4U", "FEF1D", "FEF2D", "FEF3U", "FEF4U", "FIF1D", "FIF2D", "FIF3U", "FIF4U",
    "BBI1O", "BBI2O", "BTT1O", "BTT2O", "BAF3M", "BDI3C", "BMI3C", "BTA3O", "BAT4M", "BBB4M", "BOH4M",
    "ADA1O", "ADA2O", "ADA3M", "ADA4M", "AMU1O", "AMU2O", "AMU3M", "AMU4M", "AVI1O", "AVI2O", "AVI3M", "AVI4M",
    "PPL1O", "PPL2O", "PPL3O", "PPL4O", "PAF1O", "PAF2O", "PAF3O", "PAF4O", "PSK4U",
    "GLS1O", "GLE1O", "GLE2O", "GLC2O", "GWL3O", "GLC4O", "GLN4O",
    "TCJ1O", "TCJ2O", "TCJ3C", "TCJ4C", "TEJ1O", "TEJ2O", "TEJ3M", "TEJ4M", "TGJ1O", "TGJ2O", "TGJ3M", "TGJ4M", "TMJ1O", "TMJ2O", "TMJ3C", "TMJ4C", "TTJ1O", "TTJ2O", "TTJ3C", "TTJ4C", "TXJ1O", "TXJ2O", "TXJ3E", "TXJ4E",
    "ICS2O", "ICS3U", "ICS3C", "ICS4U", "ICS4C"
]
print(json.dumps(sorted(list(set(courses)))))
